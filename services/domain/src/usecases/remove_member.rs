use thiserror::Error;

use crate::event::{AggregateId, NewEvent, UserId};
use crate::membership::{check_can_remove, member_removed_payload, MembershipViolation};
use crate::ports::{Ports, StoreError};

pub use crate::event::LIST_MEMBER_REMOVED;

#[derive(Debug, Error)]
pub enum RemoveMemberError {
    #[error(transparent)]
    NotAllowed(#[from] MembershipViolation),
    /// The target is not on the list — removing them would write an event
    /// that folds to nothing on every client.
    #[error("the target is not a member of this list")]
    NotAMember,
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct RemoveMemberRequest {
    pub aggregate: AggregateId,
    pub member_id: UserId,
    pub event_id: String,
    pub device_id: String,
}

/// Class 2: the server owns the membership projection. The owner removes
/// anyone, a member only themselves (`events.md` owner model). Event first,
/// membership second — same ordering as `join_aggregate`, so a failed second
/// step is safe to retry.
pub async fn remove_member(
    ports: &Ports<'_>,
    caller: &UserId,
    request: RemoveMemberRequest,
) -> Result<(), RemoveMemberError> {
    let aggregate = request.aggregate;
    let caller_role = ports.membership.role_of(&aggregate, caller).await?;
    check_can_remove(caller_role, *caller == request.member_id)?;

    if ports
        .membership
        .role_of(&aggregate, &request.member_id)
        .await?
        .is_none()
    {
        return Err(RemoveMemberError::NotAMember);
    }

    let stored = ports
        .events
        .append(
            &aggregate,
            NewEvent {
                event_type: aggregate.member_removed_event().into(),
                payload: member_removed_payload(&aggregate, &request.member_id),
                event_id: request.event_id,
                device_id: request.device_id,
                user_id: caller.clone(),
            },
        )
        .await?;

    ports
        .membership
        .remove_member(&aggregate, &request.member_id)
        .await?;
    let _ = ports.broadcast.publish(&aggregate.channel(), &stored).await;

    Ok(())
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

        async fn with(self, user: &str, role: MemberRole) -> Self {
            self.membership
                .add_member(&AggregateId::list("abc"), &UserId(user.into()), role)
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

        async fn log(&self) -> Vec<crate::event::StoredEvent> {
            self.store
                .events_since(&AggregateId::list("abc"), None)
                .await
                .expect("readable")
        }

        async fn role_of(&self, user: &str) -> Option<MemberRole> {
            self.membership
                .role_of(&AggregateId::list("abc"), &UserId(user.into()))
                .await
                .expect("readable")
        }
    }

    fn request(member_id: &str) -> RemoveMemberRequest {
        RemoveMemberRequest {
            aggregate: AggregateId::list("abc"),
            member_id: UserId(member_id.into()),
            event_id: "evt-1".into(),
            device_id: "device-1".into(),
        }
    }

    #[tokio::test]
    async fn the_owner_removes_a_member() {
        let fixture = Fixture::new()
            .with("mama", MemberRole::Owner)
            .await
            .with("tom", MemberRole::Member)
            .await;

        remove_member(&fixture.ports(), &UserId("mama".into()), request("tom"))
            .await
            .expect("owner may remove");

        let log = fixture.log().await;
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].event_type, LIST_MEMBER_REMOVED);
        assert_eq!(
            log[0].payload,
            json!({ "listId": "abc", "memberId": "tom" })
        );
        assert_eq!(fixture.role_of("tom").await, None);
    }

    #[tokio::test]
    async fn leaving_a_recipe_writes_the_recipe_member_event() {
        let fixture = Fixture::new();
        let recipe = AggregateId::recipe("bolo");
        fixture
            .membership
            .add_member(&recipe, &UserId("tom".into()), MemberRole::Member)
            .await
            .expect("member");

        remove_member(
            &fixture.ports(),
            &UserId("tom".into()),
            RemoveMemberRequest {
                aggregate: recipe.clone(),
                member_id: UserId("tom".into()),
                event_id: "evt-1".into(),
                device_id: "device-1".into(),
            },
        )
        .await
        .expect("leaving a recipe works like leaving a list");

        let log = fixture
            .store
            .events_since(&recipe, None)
            .await
            .expect("readable");
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].event_type, "recipes/recipeMemberRemoved");
        assert_eq!(
            log[0].payload,
            json!({ "recipeId": "bolo", "memberId": "tom" })
        );
    }

    #[tokio::test]
    async fn a_member_removes_themselves() {
        let fixture = Fixture::new()
            .with("mama", MemberRole::Owner)
            .await
            .with("tom", MemberRole::Member)
            .await;

        remove_member(&fixture.ports(), &UserId("tom".into()), request("tom"))
            .await
            .expect("leaving is allowed");

        assert_eq!(fixture.role_of("tom").await, None);
    }

    #[tokio::test]
    async fn a_member_may_not_remove_someone_else() {
        let fixture = Fixture::new()
            .with("mama", MemberRole::Owner)
            .await
            .with("tom", MemberRole::Member)
            .await
            .with("lena", MemberRole::Member)
            .await;

        let result = remove_member(&fixture.ports(), &UserId("tom".into()), request("lena")).await;

        assert!(matches!(
            result,
            Err(RemoveMemberError::NotAllowed(MembershipViolation::OwnerOnly))
        ));
        assert!(fixture.log().await.is_empty());
        assert_eq!(fixture.role_of("lena").await, Some(MemberRole::Member));
    }

    #[tokio::test]
    async fn a_stranger_may_not_remove_anyone() {
        let fixture = Fixture::new().with("tom", MemberRole::Member).await;

        let result = remove_member(&fixture.ports(), &UserId("eve".into()), request("tom")).await;

        assert!(matches!(
            result,
            Err(RemoveMemberError::NotAllowed(
                MembershipViolation::NotAMember
            ))
        ));
        assert!(fixture.log().await.is_empty());
    }

    #[tokio::test]
    async fn removing_a_non_member_writes_nothing() {
        let fixture = Fixture::new().with("mama", MemberRole::Owner).await;

        let result =
            remove_member(&fixture.ports(), &UserId("mama".into()), request("ghost")).await;

        assert!(matches!(result, Err(RemoveMemberError::NotAMember)));
        assert!(fixture.log().await.is_empty());
    }
}
