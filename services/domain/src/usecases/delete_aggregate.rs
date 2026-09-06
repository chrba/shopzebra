use serde_json::{Map, Value};
use thiserror::Error;

use crate::event::{Aggregate, NewEvent, StoredEvent, UserId};
use crate::membership::{check_can_delete, MembershipViolation};
use crate::ports::{Ports, StoreError};

#[derive(Debug, Error)]
pub enum DeleteAggregateError {
    #[error(transparent)]
    NotAllowed(#[from] MembershipViolation),
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct DeleteAggregateRequest {
    pub aggregate: Aggregate,
    pub event_id: String,
    pub device_id: String,
}

/// Class 2: deleting ends the memberships, so the server owns it — exactly
/// like `remove_member`, which is the same projection write for one person
/// instead of all. As a class-1 append it could not do that: the generic
/// path never reads a payload, so the membership rows survived the delete
/// and `GET /lists` kept naming a gone list forever, making every sync
/// cycle refetch its whole log.
///
/// One use case serves lists, recipes and plans — sharing is one mechanism
/// for all three (sharing-model.md), and so is un-sharing.
///
/// Event first, memberships second, same ordering as `remove_member`: a
/// failed second step is safe to retry because the append dedups on
/// `event_id`.
///
/// The other members never receive this event — the moment their
/// membership ends the log is closed to them. That is intended, not a
/// hole: their client notices the aggregate missing from `GET /lists` and
/// drops it locally.
pub async fn delete_aggregate(
    ports: &Ports<'_>,
    caller_id: &UserId,
    request: DeleteAggregateRequest,
) -> Result<StoredEvent, DeleteAggregateError> {
    let aggregate = request.aggregate;
    let caller_role = ports.membership.role_of(&aggregate, caller_id).await?;
    check_can_delete(caller_role)?;

    let stored_event = ports
        .events
        .append(
            &aggregate,
            NewEvent {
                event_type: aggregate.deleted_event().into(),
                payload: deleted_payload(&aggregate),
                event_id: request.event_id,
                device_id: request.device_id,
                user_id: caller_id.clone(),
            },
        )
        .await?;

    // Broadcast before the teardown: it is the last moment the other
    // members are still subscribed, so it is their only chance to see the
    // delete live instead of inferring it on the next sync.
    let _ = ports
        .broadcast
        .publish(&aggregate.channel(), &stored_event)
        .await;

    for member_id in ports.membership.members_of(&aggregate).await? {
        ports.membership.remove_member(&aggregate, &member_id).await?;
    }

    Ok(stored_event)
}

/// A delete event carries nothing but the identity of what is gone — the
/// same single field the class-1 schema of `listDeleted` describes.
fn deleted_payload(aggregate: &Aggregate) -> Value {
    let mut payload = Map::new();
    payload.insert(
        aggregate.payload_id_field().into(),
        Value::String(aggregate.id.clone()),
    );
    Value::Object(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{MemoryEventPublisher, MemoryEventStore, MemoryMembershipStore};
    use crate::ports::{EventStore, MemberRole, MembershipStore};
    use serde_json::json;

    struct Fixture {
        store: MemoryEventStore,
        membership: MemoryMembershipStore,
        publisher: MemoryEventPublisher,
    }

    impl Fixture {
        fn new() -> Self {
            Self {
                store: MemoryEventStore::new(),
                membership: MemoryMembershipStore::new(),
                publisher: MemoryEventPublisher::new(),
            }
        }

        async fn with(self, aggregate: &Aggregate, user_id: &str, role: MemberRole) -> Self {
            self.membership
                .add_member(aggregate, &UserId(user_id.into()), role)
                .await
                .expect("member");
            self
        }

        fn ports(&self) -> Ports<'_> {
            Ports {
                events: &self.store,
                membership: &self.membership,
                broadcast: &self.publisher,
            }
        }

        async fn log(&self, aggregate: &Aggregate) -> Vec<StoredEvent> {
            self.store
                .events_since(aggregate, None)
                .await
                .expect("readable")
        }

        async fn members(&self, aggregate: &Aggregate) -> Vec<UserId> {
            self.membership
                .members_of(aggregate)
                .await
                .expect("readable")
        }
    }

    fn groceries() -> Aggregate {
        Aggregate::list("abc")
    }

    fn request(aggregate: &Aggregate) -> DeleteAggregateRequest {
        DeleteAggregateRequest {
            aggregate: aggregate.clone(),
            event_id: "evt-1".into(),
            device_id: "device-1".into(),
        }
    }

    #[tokio::test]
    async fn the_owner_deletes_and_the_event_lands_in_the_log() {
        let fixture = Fixture::new()
            .with(&groceries(), "mama", MemberRole::Owner)
            .await;

        let stored_event = delete_aggregate(
            &fixture.ports(),
            &UserId("mama".into()),
            request(&groceries()),
        )
        .await
        .expect("the owner may delete");

        assert_eq!(stored_event.event_type, "lists/listDeleted");
        let log = fixture.log(&groceries()).await;
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].event_type, "lists/listDeleted");
        assert_eq!(log[0].payload, json!({ "listId": "abc" }));
    }

    #[tokio::test]
    async fn deleting_ends_every_membership_so_nobody_pulls_the_log_again() {
        let fixture = Fixture::new()
            .with(&groceries(), "mama", MemberRole::Owner)
            .await
            .with(&groceries(), "tom", MemberRole::Member)
            .await
            .with(&groceries(), "lena", MemberRole::Member)
            .await;

        delete_aggregate(
            &fixture.ports(),
            &UserId("mama".into()),
            request(&groceries()),
        )
        .await
        .expect("the owner may delete");

        assert!(fixture.members(&groceries()).await.is_empty());
        for user_id in ["mama", "tom", "lena"] {
            let held = fixture
                .membership
                .aggregates_of(&UserId(user_id.into()))
                .await
                .expect("readable");
            assert!(held.is_empty(), "{user_id} still holds the deleted list");
        }
    }

    #[tokio::test]
    async fn a_member_may_not_delete_what_is_not_theirs() {
        let fixture = Fixture::new()
            .with(&groceries(), "mama", MemberRole::Owner)
            .await
            .with(&groceries(), "tom", MemberRole::Member)
            .await;

        let result = delete_aggregate(
            &fixture.ports(),
            &UserId("tom".into()),
            request(&groceries()),
        )
        .await;

        assert!(matches!(
            result,
            Err(DeleteAggregateError::NotAllowed(
                MembershipViolation::OwnerOnly
            ))
        ));
        assert!(fixture.log(&groceries()).await.is_empty());
        assert_eq!(fixture.members(&groceries()).await.len(), 2);
    }

    #[tokio::test]
    async fn a_stranger_may_not_delete_anything() {
        let fixture = Fixture::new()
            .with(&groceries(), "mama", MemberRole::Owner)
            .await;

        let result = delete_aggregate(
            &fixture.ports(),
            &UserId("eve".into()),
            request(&groceries()),
        )
        .await;

        assert!(matches!(
            result,
            Err(DeleteAggregateError::NotAllowed(
                MembershipViolation::NotAMember
            ))
        ));
        assert!(fixture.log(&groceries()).await.is_empty());
        assert_eq!(fixture.members(&groceries()).await.len(), 1);
    }

    #[tokio::test]
    async fn deleting_a_recipe_writes_the_recipe_event() {
        let bolognese = Aggregate::recipe("bolo");
        let fixture = Fixture::new()
            .with(&bolognese, "mama", MemberRole::Owner)
            .await;

        delete_aggregate(
            &fixture.ports(),
            &UserId("mama".into()),
            request(&bolognese),
        )
        .await
        .expect("a recipe is deleted like a list");

        let log = fixture.log(&bolognese).await;
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].event_type, "recipes/recipeDeleted");
        assert_eq!(log[0].payload, json!({ "recipeId": "bolo" }));
        assert!(fixture.members(&bolognese).await.is_empty());
    }

    #[tokio::test]
    async fn deleting_one_list_leaves_the_others_alone() {
        let other = Aggregate::list("def");
        let fixture = Fixture::new()
            .with(&groceries(), "mama", MemberRole::Owner)
            .await
            .with(&other, "mama", MemberRole::Owner)
            .await;

        delete_aggregate(
            &fixture.ports(),
            &UserId("mama".into()),
            request(&groceries()),
        )
        .await
        .expect("the owner may delete");

        assert_eq!(
            fixture
                .membership
                .aggregates_of(&UserId("mama".into()))
                .await
                .expect("readable"),
            vec![other]
        );
    }

    #[tokio::test]
    async fn the_delete_is_broadcast_while_the_members_can_still_hear_it() {
        let fixture = Fixture::new()
            .with(&groceries(), "mama", MemberRole::Owner)
            .await;

        delete_aggregate(
            &fixture.ports(),
            &UserId("mama".into()),
            request(&groceries()),
        )
        .await
        .expect("the owner may delete");

        assert_eq!(fixture.publisher.published_channels(), vec!["lists/abc"]);
    }
}
