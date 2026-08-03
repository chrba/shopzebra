use async_trait::async_trait;
use aws_sdk_dynamodb::types::{AttributeValue, Put, TransactWriteItem};
use aws_sdk_dynamodb::Client;

use domain::event::UserId;
use domain::ports::{FriendInviteStore, FriendStore, StoreError, StoredFriendInvite};

const FRIEND_PREFIX: &str = "FRIEND#";
const TOKEN_SK: &str = "TOKEN";
const TOKEN_PK_PREFIX: &str = "FRIENDTOKEN#";
const USER_PK_PREFIX: &str = "USER#";

/// The address book, in the membership table:
///   pk "USER#<a>"          sk "FRIEND#<b>"   one row per direction
///   pk "FRIENDTOKEN#<tok>" sk "TOKEN"        attrs invitedBy, expiresAt
///
/// None of these rows carries a `userId` attribute. The `byUser` GSI indexes
/// exactly that attribute, and DynamoDB only picks up items that have it —
/// were it present, friendships would surface in `aggregates_of()`, the query
/// that decides which lists a device syncs.
pub struct DynamoDbFriendStore {
    client: Client,
    table_name: String,
}

impl DynamoDbFriendStore {
    pub fn new(client: Client, table_name: String) -> Self {
        Self { client, table_name }
    }
}

fn user_partition_key(user_id: &UserId) -> String {
    format!("{USER_PK_PREFIX}{}", user_id.0)
}

fn friend_sort_key(friend_id: &UserId) -> String {
    format!("{FRIEND_PREFIX}{}", friend_id.0)
}

#[async_trait]
impl FriendStore for DynamoDbFriendStore {
    async fn friends_of(&self, user_id: &UserId) -> Result<Vec<UserId>, StoreError> {
        let result = self
            .client
            .query()
            .table_name(&self.table_name)
            .key_condition_expression("pk = :pk AND begins_with(sk, :prefix)")
            .expression_attribute_values(":pk", AttributeValue::S(user_partition_key(user_id)))
            .expression_attribute_values(":prefix", AttributeValue::S(FRIEND_PREFIX.into()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        Ok(result
            .items()
            .iter()
            .filter_map(|item| item.get("sk").and_then(|value| value.as_s().ok()))
            .filter_map(|sort_key| sort_key.strip_prefix(FRIEND_PREFIX))
            .map(|friend_id| UserId(friend_id.to_string()))
            .collect())
    }

    async fn is_friend(&self, user_id: &UserId, other_id: &UserId) -> Result<bool, StoreError> {
        let item = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(user_partition_key(user_id)))
            .key("sk", AttributeValue::S(friend_sort_key(other_id)))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        Ok(item.item.is_some())
    }

    async fn add_friend(&self, user_id: &UserId, friend_id: &UserId) -> Result<(), StoreError> {
        self.client
            .put_item()
            .table_name(&self.table_name)
            .item("pk", AttributeValue::S(user_partition_key(user_id)))
            .item("sk", AttributeValue::S(friend_sort_key(friend_id)))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        Ok(())
    }

    async fn remove_friend(&self, user_id: &UserId, friend_id: &UserId) -> Result<(), StoreError> {
        self.client
            .delete_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(user_partition_key(user_id)))
            .key("sk", AttributeValue::S(friend_sort_key(friend_id)))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        Ok(())
    }
}

/// Friendship invite tokens. Two rows per token, mirroring the list invites:
/// one under the inviter for reuse, one under the token for redemption.
pub struct DynamoDbFriendInviteStore {
    client: Client,
    table_name: String,
}

impl DynamoDbFriendInviteStore {
    pub fn new(client: Client, table_name: String) -> Self {
        Self { client, table_name }
    }
}

/// A row with an unreadable expiry counts as absent rather than as a token
/// that never expires — the safe direction for something that grants access.
fn invite_from_parts(
    token: String,
    invited_by: String,
    expires_at: Option<&str>,
) -> Option<StoredFriendInvite> {
    let expires_at_ms = expires_at?.parse().ok()?;
    Some(StoredFriendInvite {
        token,
        invited_by: UserId(invited_by),
        expires_at_ms,
    })
}

fn attribute<'a>(
    item: &'a std::collections::HashMap<String, AttributeValue>,
    key: &str,
    numeric: bool,
) -> Option<&'a str> {
    let value = item.get(key)?;
    let text = if numeric {
        value.as_n().ok()?
    } else {
        value.as_s().ok()?
    };
    Some(text.as_str())
}

#[async_trait]
impl FriendInviteStore for DynamoDbFriendInviteStore {
    async fn friend_invite_for(
        &self,
        user_id: &UserId,
    ) -> Result<Option<StoredFriendInvite>, StoreError> {
        let response = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(user_partition_key(user_id)))
            .key("sk", AttributeValue::S(TOKEN_SK.into()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        let Some(item) = response.item() else {
            return Ok(None);
        };
        let Some(token) = attribute(item, "token", false) else {
            return Ok(None);
        };
        Ok(invite_from_parts(
            token.to_string(),
            user_id.0.clone(),
            attribute(item, "expiresAt", true),
        ))
    }

    async fn friend_invite_by_token(
        &self,
        token: &str,
    ) -> Result<Option<StoredFriendInvite>, StoreError> {
        let response = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(format!("{TOKEN_PK_PREFIX}{token}")))
            .key("sk", AttributeValue::S(TOKEN_SK.into()))
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        let Some(item) = response.item() else {
            return Ok(None);
        };
        let Some(invited_by) = attribute(item, "invitedBy", false) else {
            return Ok(None);
        };
        Ok(invite_from_parts(
            token.to_string(),
            invited_by.to_string(),
            attribute(item, "expiresAt", true),
        ))
    }

    async fn put_friend_invite(&self, invite: &StoredFriendInvite) -> Result<(), StoreError> {
        let expires_at = invite.expires_at_ms.to_string();

        // One transaction for both rows, like DynamoDbInviteStore::put_invite.
        // Were the writes separate and the second one failed, the inviter's
        // row would keep handing out an unexpired token whose redemption row
        // does not exist — a dead link for seven days with no repair path.
        let inviter_row = Put::builder()
            .table_name(&self.table_name)
            .item("pk", AttributeValue::S(user_partition_key(&invite.invited_by)))
            .item("sk", AttributeValue::S(TOKEN_SK.into()))
            .item("token", AttributeValue::S(invite.token.clone()))
            .item("expiresAt", AttributeValue::N(expires_at.clone()))
            .build()
            .map_err(|error| StoreError(error.to_string()))?;

        // `invitedBy`, deliberately not `userId` — see the type comment.
        let token_row = Put::builder()
            .table_name(&self.table_name)
            .item(
                "pk",
                AttributeValue::S(format!("{TOKEN_PK_PREFIX}{}", invite.token)),
            )
            .item("sk", AttributeValue::S(TOKEN_SK.into()))
            .item("invitedBy", AttributeValue::S(invite.invited_by.0.clone()))
            .item("expiresAt", AttributeValue::N(expires_at))
            .build()
            .map_err(|error| StoreError(error.to_string()))?;

        self.client
            .transact_write_items()
            .transact_items(TransactWriteItem::builder().put(inviter_row).build())
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
        assert_eq!(
            invite_from_parts("tok".into(), "sarah".into(), Some("not-a-number")),
            None
        );
        assert_eq!(invite_from_parts("tok".into(), "sarah".into(), None), None);
    }

    #[test]
    fn a_wellformed_item_maps_to_the_invite() {
        let invite =
            invite_from_parts("tok".into(), "sarah".into(), Some("42")).expect("maps");

        assert_eq!(invite.token, "tok");
        assert_eq!(invite.invited_by, UserId("sarah".into()));
        assert_eq!(invite.expires_at_ms, 42);
    }

    #[test]
    fn keys_are_namespaced_so_friendships_never_collide_with_lists() {
        assert_eq!(user_partition_key(&UserId("sarah".into())), "USER#sarah");
        assert_eq!(friend_sort_key(&UserId("tom".into())), "FRIEND#tom");
    }
}
