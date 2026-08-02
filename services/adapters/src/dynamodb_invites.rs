use async_trait::async_trait;
use aws_sdk_dynamodb::types::{AttributeValue, Put, TransactWriteItem};
use aws_sdk_dynamodb::Client;

use domain::event::AggregateId;
use domain::ports::{InviteStore, StoreError, StoredInvite};

const INVITE_SK: &str = "INVITE";
const INVITE_PK_PREFIX: &str = "INVITE#";

/// Both lookups live in the membership table, addressed by two rows:
///   pk "<KIND>#<id>"     sk "INVITE"  — attrs token, expiresAt
///   pk "INVITE#<token>"  sk "INVITE"  — attrs aggregate, expiresAt
///
/// The token row stores the full partition key, not the bare id: the token
/// is the only thing that says WHICH aggregate is being joined, and a
/// recipe invite that read back as a list invite would put the joiner into
/// the wrong aggregate entirely.
///
/// Neither row carries a `userId` attribute, so both stay out of the
/// `byUser` GSI — an invite must never look like a membership.
pub struct DynamoDbInviteStore {
    client: Client,
    table_name: String,
}

impl DynamoDbInviteStore {
    pub fn new(client: Client, table_name: String) -> Self {
        Self { client, table_name }
    }
}

fn token_partition_key(token: &str) -> String {
    format!("{INVITE_PK_PREFIX}{token}")
}

/// A row with an unreadable expiry — or one naming an aggregate we cannot
/// make sense of — is treated as absent rather than as a never-expiring
/// invite: the safe direction for an authorization token.
fn invite_from_parts(
    token: String,
    aggregate: &AggregateId,
    expires_at: Option<&str>,
) -> Option<StoredInvite> {
    let expires_at_ms = expires_at?.parse().ok()?;
    Some(StoredInvite {
        token,
        aggregate: aggregate.clone(),
        expires_at_ms,
    })
}

fn string_attribute<'a>(
    item: &'a std::collections::HashMap<String, AttributeValue>,
    key: &str,
) -> Option<&'a str> {
    item.get(key).and_then(|value| value.as_s().ok()).map(String::as_str)
}

fn number_attribute<'a>(
    item: &'a std::collections::HashMap<String, AttributeValue>,
    key: &str,
) -> Option<&'a str> {
    item.get(key).and_then(|value| value.as_n().ok()).map(String::as_str)
}

#[async_trait]
impl InviteStore for DynamoDbInviteStore {
    async fn invite_for(
        &self,
        aggregate: &AggregateId,
    ) -> Result<Option<StoredInvite>, StoreError> {
        let response = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(aggregate.partition_key()))
            .key("sk", AttributeValue::S(INVITE_SK.into()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        let Some(item) = response.item() else {
            return Ok(None);
        };
        let Some(token) = string_attribute(item, "token") else {
            return Ok(None);
        };
        Ok(invite_from_parts(
            token.to_string(),
            aggregate,
            number_attribute(item, "expiresAt"),
        ))
    }

    async fn invite_by_token(&self, token: &str) -> Result<Option<StoredInvite>, StoreError> {
        let response = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(token_partition_key(token)))
            .key("sk", AttributeValue::S(INVITE_SK.into()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        let Some(item) = response.item() else {
            return Ok(None);
        };
        let Some(aggregate) = string_attribute(item, "aggregate")
            .and_then(AggregateId::from_partition_key)
        else {
            return Ok(None);
        };
        Ok(invite_from_parts(
            token.to_string(),
            &aggregate,
            number_attribute(item, "expiresAt"),
        ))
    }

    async fn put_invite(&self, invite: &StoredInvite) -> Result<(), StoreError> {
        let expires_at = invite.expires_at_ms.to_string();

        // The aggregate row is overwritten, so a replaced token stops being
        // reachable from the aggregate. Its token row is left behind and
        // simply ages out via the expiry check in the use case — cheaper
        // than a read-modify-delete, and an orphan row grants nothing once
        // expired.
        let aggregate_row = Put::builder()
            .table_name(&self.table_name)
            .item("pk", AttributeValue::S(invite.aggregate.partition_key()))
            .item("sk", AttributeValue::S(INVITE_SK.into()))
            .item("token", AttributeValue::S(invite.token.clone()))
            .item("expiresAt", AttributeValue::N(expires_at.clone()))
            .build()
            .map_err(|error| StoreError(error.to_string()))?;

        let token_row = Put::builder()
            .table_name(&self.table_name)
            .item("pk", AttributeValue::S(token_partition_key(&invite.token)))
            .item("sk", AttributeValue::S(INVITE_SK.into()))
            .item(
                "aggregate",
                AttributeValue::S(invite.aggregate.partition_key()),
            )
            .item("expiresAt", AttributeValue::N(expires_at))
            .build()
            .map_err(|error| StoreError(error.to_string()))?;

        self.client
            .transact_write_items()
            .transact_items(TransactWriteItem::builder().put(aggregate_row).build())
            .transact_items(TransactWriteItem::builder().put(token_row).build())
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_malformed_expiry_yields_no_invite() {
        let list = AggregateId::list("list-1");
        assert_eq!(
            invite_from_parts("tok".into(), &list, Some("not-a-number")),
            None
        );
        assert_eq!(invite_from_parts("tok".into(), &list, None), None);
    }

    #[test]
    fn a_wellformed_item_maps_to_the_invite() {
        let invite = invite_from_parts("tok".into(), &AggregateId::list("abc"), Some("42"))
            .expect("maps");

        assert_eq!(invite.token, "tok");
        assert_eq!(invite.aggregate, AggregateId::list("abc"));
        assert_eq!(invite.expires_at_ms, 42);
    }

    /// The token is the ONLY thing that says what is being joined. If the
    /// kind did not survive the round trip, redeeming a recipe invite would
    /// silently put the joiner into a list of the same id.
    #[test]
    fn the_kind_survives_the_token_row_round_trip() {
        let recipe = AggregateId::recipe("bolo");

        let stored = recipe.partition_key();
        let read_back = AggregateId::from_partition_key(&stored).expect("readable");

        assert_eq!(read_back, recipe);
        assert_eq!(
            invite_from_parts("tok".into(), &read_back, Some("42"))
                .expect("maps")
                .aggregate,
            recipe
        );
    }

    #[test]
    fn a_token_row_naming_no_known_aggregate_yields_no_invite() {
        assert_eq!(AggregateId::from_partition_key("GARBAGE#x"), None);
    }

    #[test]
    fn the_token_partition_key_is_namespaced() {
        assert_eq!(token_partition_key("abc"), "INVITE#abc");
    }
}
