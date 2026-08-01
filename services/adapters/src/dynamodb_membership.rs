use async_trait::async_trait;
use aws_sdk_dynamodb::types::{AttributeValue, Put, TransactWriteItem};
use aws_sdk_dynamodb::Client;

use domain::event::{AggregateId, UserId};
use domain::ports::{MemberRole, MembershipStore, StoreError};

const MEMBER_PREFIX: &str = "MEMBER#";
const OWNER_MARKER: &str = "OWNER";
pub const BY_USER_INDEX: &str = "byUser";

/// Item layout in one partition (pk = aggregate partition key):
///   sk "OWNER"            — claimed exactly once (conditional put)
///   sk "MEMBER#<userId>"  — one item per member, attr role + userId (GSI)
pub struct DynamoDbMembershipStore {
    client: Client,
    table_name: String,
}

impl DynamoDbMembershipStore {
    pub fn new(client: Client, table_name: String) -> Self {
        Self { client, table_name }
    }
}

fn role_to_attribute(role: MemberRole) -> &'static str {
    match role {
        MemberRole::Owner => "owner",
        MemberRole::Member => "member",
    }
}

fn role_from_attribute(value: &str) -> Option<MemberRole> {
    match value {
        "owner" => Some(MemberRole::Owner),
        "member" => Some(MemberRole::Member),
        _ => None,
    }
}

#[async_trait]
impl MembershipStore for DynamoDbMembershipStore {
    async fn claim_ownership(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<bool, StoreError> {
        // `claimedBy`, deliberately NOT `userId`: the byUser GSI indexes
        // the `userId` attribute, and the claim marker must stay out of
        // it — otherwise every owner shows up twice in aggregates_of
        // (marker row + membership row).
        let owner_marker = Put::builder()
            .table_name(&self.table_name)
            .item("pk", AttributeValue::S(aggregate.partition_key()))
            .item("sk", AttributeValue::S(OWNER_MARKER.into()))
            .item("claimedBy", AttributeValue::S(user.0.clone()))
            .condition_expression("attribute_not_exists(sk)")
            .build()
            .map_err(|error| StoreError(error.to_string()))?;

        let owner_membership = Put::builder()
            .table_name(&self.table_name)
            .item("pk", AttributeValue::S(aggregate.partition_key()))
            .item("sk", AttributeValue::S(format!("{MEMBER_PREFIX}{}", user.0)))
            .item("userId", AttributeValue::S(user.0.clone()))
            .item("role", AttributeValue::S(role_to_attribute(MemberRole::Owner).into()))
            .build()
            .map_err(|error| StoreError(error.to_string()))?;

        let result = self
            .client
            .transact_write_items()
            .transact_items(TransactWriteItem::builder().put(owner_marker).build())
            .transact_items(TransactWriteItem::builder().put(owner_membership).build())
            .send()
            .await;

        match result {
            Ok(_) => Ok(true),
            // Any cancellation means the owner marker already exists.
            Err(error) if error.to_string().contains("TransactionCanceled") => Ok(false),
            Err(error) => Err(StoreError(error.to_string())),
        }
    }

    async fn role_of(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<Option<MemberRole>, StoreError> {
        let item = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(aggregate.partition_key()))
            .key("sk", AttributeValue::S(format!("{MEMBER_PREFIX}{}", user.0)))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        Ok(item
            .item
            .and_then(|attributes| attributes.get("role").and_then(|value| value.as_s().ok().cloned()))
            .and_then(|role| role_from_attribute(&role)))
    }

    async fn owner_of(&self, aggregate: &AggregateId) -> Result<Option<UserId>, StoreError> {
        // Read the claim marker rather than scanning members for the owner
        // role: it is a single point read, and it is written in the same
        // transaction that makes someone owner.
        let item = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(aggregate.partition_key()))
            .key("sk", AttributeValue::S(OWNER_MARKER.into()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        Ok(item
            .item
            .and_then(|attributes| {
                attributes
                    .get("claimedBy")
                    .and_then(|value| value.as_s().ok().cloned())
            })
            .map(UserId))
    }

    async fn add_member(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
        role: MemberRole,
    ) -> Result<(), StoreError> {
        self.client
            .put_item()
            .table_name(&self.table_name)
            .item("pk", AttributeValue::S(aggregate.partition_key()))
            .item("sk", AttributeValue::S(format!("{MEMBER_PREFIX}{}", user.0)))
            .item("userId", AttributeValue::S(user.0.clone()))
            .item("role", AttributeValue::S(role_to_attribute(role).into()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        Ok(())
    }

    async fn remove_member(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<(), StoreError> {
        self.client
            .delete_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(aggregate.partition_key()))
            .key("sk", AttributeValue::S(format!("{MEMBER_PREFIX}{}", user.0)))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        Ok(())
    }

    async fn members_of(&self, aggregate: &AggregateId) -> Result<Vec<UserId>, StoreError> {
        // Only the MEMBER# rows: the OWNER marker names the same person
        // again, and the INVITE row is no membership at all.
        let result = self
            .client
            .query()
            .table_name(&self.table_name)
            .key_condition_expression("pk = :pk AND begins_with(sk, :prefix)")
            .expression_attribute_values(":pk", AttributeValue::S(aggregate.partition_key()))
            .expression_attribute_values(":prefix", AttributeValue::S(MEMBER_PREFIX.into()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        Ok(result
            .items()
            .iter()
            .filter_map(|item| item.get("userId").and_then(|value| value.as_s().ok()))
            .map(|user_id| UserId(user_id.clone()))
            .collect())
    }

    async fn aggregates_of(&self, user: &UserId) -> Result<Vec<AggregateId>, StoreError> {
        let result = self
            .client
            .query()
            .table_name(&self.table_name)
            .index_name(BY_USER_INDEX)
            .key_condition_expression("userId = :userId")
            .expression_attribute_values(":userId", AttributeValue::S(user.0.clone()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        let partition_keys = result
            .items()
            .iter()
            .filter_map(|item| item.get("pk").and_then(|value| value.as_s().ok()))
            .map(String::as_str);
        Ok(distinct_lists(partition_keys))
    }
}

/// Maps index rows to list ids, each list exactly once. The index may
/// hold several rows per (list, user) — historically the owner claim
/// marker carried a `userId` attribute and showed up next to the
/// membership row, duplicating every owned list in the response.
fn distinct_lists<'a>(partition_keys: impl Iterator<Item = &'a str>) -> Vec<AggregateId> {
    let mut seen = std::collections::HashSet::new();
    partition_keys
        .filter_map(|partition| partition.strip_prefix("LIST#"))
        .filter(|list_id| seen.insert(list_id.to_string()))
        .map(AggregateId::list)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_list_appears_once_even_when_the_index_holds_owner_and_member_rows() {
        let index_rows = ["LIST#abc", "LIST#abc", "LIST#def"];

        let lists = distinct_lists(index_rows.into_iter());

        let ids: Vec<_> = lists.into_iter().map(|aggregate| aggregate.id).collect();
        assert_eq!(ids, vec!["abc".to_string(), "def".to_string()]);
    }

    #[test]
    fn non_list_rows_are_ignored() {
        let index_rows = ["LIST#abc", "RECIPE#r1"];

        let lists = distinct_lists(index_rows.into_iter());

        assert_eq!(lists.len(), 1);
    }
}
