use thiserror::Error;

use crate::event::{AggregateId, NewEvent, UserId};
use crate::membership::{check_can_invite, member_added_payload, MembershipViolation};
use crate::limits::MAX_LIST_MEMBERS;
use crate::ports::{FriendStore, MemberRole, Ports, StoreError, UserDirectory};
use crate::usecases::friends::befriend;
use crate::usecases::join_aggregate::UNKNOWN_MEMBER_NAME;

#[derive(Debug, Error)]
pub enum AddMemberError {
    #[error(transparent)]
    NotAllowed(#[from] MembershipViolation),
    /// The target is not in the caller's address book. Without this, knowing
    /// a user id would be enough to push a stranger onto your list.
    #[error("the target is not in the caller's address book")]
    NotAFriend,
    /// The list already holds MAX_LIST_MEMBERS people.
    #[error("this list is full")]
    ListFull,
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct AddMemberRequest {
    pub aggregate: AggregateId,
    pub member_id: UserId,
    pub event_id: String,
    pub device_id: String,
}

/// Class 2: the owner adds somebody from their address book, without the
/// detour over an invite token — both accounts exist and the two already
/// know each other. Everyone else still needs an invite link.
pub async fn add_member(
    ports: &Ports<'_>,
    users: &dyn UserDirectory,
    friends: &dyn FriendStore,
    caller: &UserId,
    request: AddMemberRequest,
) -> Result<(), AddMemberError> {
    let aggregate = request.aggregate;
    let role = ports.membership.role_of(&aggregate, caller).await?;
    check_can_invite(role)?;

    if ports
        .membership
        .role_of(&aggregate, &request.member_id)
        .await?
        .is_some()
    {
        // Already on the list — nothing to write, and the client only needs
        // to know it can stop asking.
        return Ok(());
    }

    if !friends.is_friend(caller, &request.member_id).await? {
        return Err(AddMemberError::NotAFriend);
    }

    let members = ports.membership.members_of(&aggregate).await?;
    if members.len() >= MAX_LIST_MEMBERS {
        return Err(AddMemberError::ListFull);
    }

    let name = users
        .display_name(&request.member_id)
        .await?
        .unwrap_or_else(|| UNKNOWN_MEMBER_NAME.into());

    let stored = ports
        .events
        .append(
            &aggregate,
            NewEvent {
                event_type: aggregate.member_added_event().into(),
                payload: member_added_payload(&aggregate, &request.member_id, &name),
                event_id: request.event_id,
                device_id: request.device_id,
                user_id: caller.clone(),
            },
        )
        .await?;

    ports
        .membership
        .add_member(&aggregate, &request.member_id, MemberRole::Member)
        .await?;

    // The newcomer and everyone already there now share something.
    // Best-effort, like the broadcast below: befriending is a side effect
    // of joining, not its condition. Propagating a transient put failure
    // here would 500 a join that already committed — and the retry's
    // already-member early-return would then skip this loop forever,
    // losing the friendships with no repair path. A silently missing
    // friendship, by contrast, is curable via the friend invite link.
    for member in &members {
        let _ = befriend(friends, &request.member_id, member).await;
    }

    let _ = ports.broadcast.publish(&aggregate.channel(), &stored).await;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{
        MemoryEventPublisher, MemoryEventStore, MemoryFriendStore, MemoryMembershipStore,
        MemoryUserDirectory,
    };
    use crate::ports::{EventStore, MembershipStore};
    use crate::usecases::join_aggregate::LIST_MEMBER_ADDED;
    use serde_json::json;

    struct Fixture {
        store: MemoryEventStore,
        membership: MemoryMembershipStore,
        publisher: MemoryEventPublisher,
        friends: MemoryFriendStore,
    }

    impl Fixture {
        fn new() -> Self {
            Self {
                store: MemoryEventStore::new(),
                membership: MemoryMembershipStore::new(),
                publisher: MemoryEventPublisher::new(),
                friends: MemoryFriendStore::new(),
            }
        }

        async fn with(self, list: &str, user: &str, role: MemberRole) -> Self {
            self.with_aggregate(&AggregateId::list(list), user, role).await
        }

        async fn with_aggregate(
            self,
            aggregate: &AggregateId,
            user: &str,
            role: MemberRole,
        ) -> Self {
            self.membership
                .add_member(aggregate, &UserId(user.into()), role)
                .await
                .expect("member");
            self
        }

        async fn befriended(mut self, a: &str, b: &str) -> Self {
            self.friends = self.friends.with_friendship(a, b).await;
            self
        }

        fn ports(&self) -> Ports<'_> {
            Ports {
                events: &self.store,
                membership: &self.membership,
                broadcast: &self.publisher,
            }
        }

        async fn log(&self, list: &str) -> Vec<crate::event::StoredEvent> {
            self.store
                .events_since(&AggregateId::list(list), None)
                .await
                .expect("readable")
        }

        async fn role_of(&self, list: &str, user: &str) -> Option<MemberRole> {
            self.membership
                .role_of(&AggregateId::list(list), &UserId(user.into()))
                .await
                .expect("readable")
        }
    }

    fn request(list_id: &str, member_id: &str) -> AddMemberRequest {
        AddMemberRequest {
            aggregate: AggregateId::list(list_id),
            member_id: UserId(member_id.into()),
            event_id: "evt-1".into(),
            device_id: "device-1".into(),
        }
    }

    /// Mama owns a fresh list and has Tom in her address book.
    async fn mama_with_tom_as_friend() -> Fixture {
        Fixture::new()
            .with("new-list", "mama", MemberRole::Owner)
            .await
            .befriended("mama", "tom")
            .await
    }

    #[tokio::test]
    async fn the_owner_adds_someone_from_their_address_book() {
        let fixture = mama_with_tom_as_friend().await;
        let users = MemoryUserDirectory::new().with_name("tom", "Tom");

        add_member(
            &fixture.ports(),
            &users,
            &fixture.friends,
            &UserId("mama".into()),
            request("new-list", "tom"),
        )
        .await
        .expect("a friend may be added");

        let log = fixture.log("new-list").await;
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].event_type, LIST_MEMBER_ADDED);
        assert_eq!(
            log[0].payload,
            json!({ "listId": "new-list", "memberId": "tom", "name": "Tom" })
        );
        assert_eq!(
            fixture.role_of("new-list", "tom").await,
            Some(MemberRole::Member)
        );
    }

    #[tokio::test]
    async fn somebody_outside_the_address_book_needs_an_invite_link() {
        let fixture = mama_with_tom_as_friend().await;
        let users = MemoryUserDirectory::new();

        let result = add_member(
            &fixture.ports(),
            &users,
            &fixture.friends,
            &UserId("mama".into()),
            request("new-list", "eve"),
        )
        .await;

        assert!(matches!(result, Err(AddMemberError::NotAFriend)));
        assert!(fixture.log("new-list").await.is_empty());
    }

    #[tokio::test]
    async fn sharing_a_list_makes_the_newcomer_a_friend_of_everyone_on_it() {
        let fixture = mama_with_tom_as_friend()
            .await
            .with("new-list", "papa", MemberRole::Member)
            .await;
        let users = MemoryUserDirectory::new();

        add_member(
            &fixture.ports(),
            &users,
            &fixture.friends,
            &UserId("mama".into()),
            request("new-list", "tom"),
        )
        .await
        .expect("adds");

        // Papa was already on the list and had never met Tom.
        assert!(fixture
            .friends
            .is_friend(&UserId("tom".into()), &UserId("papa".into()))
            .await
            .expect("readable"));
        assert!(fixture
            .friends
            .is_friend(&UserId("papa".into()), &UserId("tom".into()))
            .await
            .expect("readable"));
    }

    #[tokio::test]
    async fn a_full_list_takes_nobody_else() {
        let mut fixture = Fixture::new().with("full", "mama", MemberRole::Owner).await;
        for index in 1..MAX_LIST_MEMBERS {
            fixture = fixture
                .with("full", &format!("member-{index}"), MemberRole::Member)
                .await;
        }
        fixture = fixture.befriended("mama", "tom").await;
        let users = MemoryUserDirectory::new();

        let result = add_member(
            &fixture.ports(),
            &users,
            &fixture.friends,
            &UserId("mama".into()),
            request("full", "tom"),
        )
        .await;

        assert!(matches!(result, Err(AddMemberError::ListFull)));
        assert!(fixture.log("full").await.is_empty());
    }

    #[tokio::test]
    async fn a_plain_member_may_not_add_anyone() {
        let fixture = Fixture::new()
            .with("shared", "mama", MemberRole::Owner)
            .await
            .with("shared", "tom", MemberRole::Member)
            .await
            .befriended("tom", "lena")
            .await;
        let users = MemoryUserDirectory::new();

        let result = add_member(
            &fixture.ports(),
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("shared", "lena"),
        )
        .await;

        assert!(matches!(
            result,
            Err(AddMemberError::NotAllowed(MembershipViolation::OwnerOnly))
        ));
    }

    #[tokio::test]
    async fn adding_an_existing_member_writes_nothing() {
        let fixture = mama_with_tom_as_friend()
            .await
            .with("new-list", "tom", MemberRole::Member)
            .await;
        let users = MemoryUserDirectory::new();

        add_member(
            &fixture.ports(),
            &users,
            &fixture.friends,
            &UserId("mama".into()),
            request("new-list", "tom"),
        )
        .await
        .expect("idempotent");

        assert!(fixture.log("new-list").await.is_empty());
    }

    #[tokio::test]
    async fn adding_someone_to_a_recipe_writes_the_recipe_member_event() {
        let fixture = Fixture::new()
            .with_aggregate(&AggregateId::recipe("bolo"), "mama", MemberRole::Owner)
            .await
            .befriended("mama", "tom")
            .await;
        let users = MemoryUserDirectory::new().with_name("tom", "Tom");

        add_member(
            &fixture.ports(),
            &users,
            &fixture.friends,
            &UserId("mama".into()),
            AddMemberRequest {
                aggregate: AggregateId::recipe("bolo"),
                member_id: UserId("tom".into()),
                event_id: "evt-1".into(),
                device_id: "device-1".into(),
            },
        )
        .await
        .expect("a recipe is shared like a list");

        let log = fixture
            .store
            .events_since(&AggregateId::recipe("bolo"), None)
            .await
            .expect("readable");
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].event_type, "recipes/recipeMemberAdded");
        assert_eq!(
            log[0].payload,
            json!({ "recipeId": "bolo", "memberId": "tom", "name": "Tom" })
        );
    }

    #[tokio::test]
    async fn an_unknown_name_falls_back_to_the_placeholder() {
        let fixture = mama_with_tom_as_friend().await;
        let users = MemoryUserDirectory::new();

        add_member(
            &fixture.ports(),
            &users,
            &fixture.friends,
            &UserId("mama".into()),
            request("new-list", "tom"),
        )
        .await
        .expect("adds");

        let log = fixture.log("new-list").await;
        assert_eq!(
            log[0].payload.get("name").and_then(|name| name.as_str()),
            Some(UNKNOWN_MEMBER_NAME)
        );
    }
}
