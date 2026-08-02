use thiserror::Error;

use crate::event::{AggregateId, NewEvent, UserId};
use crate::limits::MAX_LIST_MEMBERS;
use crate::membership::member_added_payload;
use crate::ports::{FriendStore, InviteStore, MemberRole, Ports, StoreError, UserDirectory};
use crate::usecases::friends::befriend;

pub use crate::event::LIST_MEMBER_ADDED;

/// Shown when the identity provider knows no display name for the joiner.
pub const UNKNOWN_MEMBER_NAME: &str = "Mitglied";

#[derive(Debug, Error)]
pub enum JoinAggregateError {
    /// Unknown and expired tokens collapse into one error on purpose —
    /// the caller must not be able to tell them apart.
    #[error("invalid or expired invite token")]
    InvalidToken,
    /// The aggregate already holds MAX_LIST_MEMBERS people.
    #[error("this list is full")]
    ListFull,
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct JoinAggregateRequest {
    pub token: String,
    pub event_id: String,
    pub device_id: String,
    pub now_ms: u64,
}

#[derive(Debug)]
pub struct JoinedAggregate {
    /// Which aggregate was joined — the token decides, not the route, so
    /// the caller learns from here whether to open a list or a recipe.
    pub aggregate: AggregateId,
    pub already_member: bool,
}

/// Class 2: the server verifies the token, enriches the display name from
/// the identity provider and writes the member-added event itself — the type
/// is not client-appendable (the envelope allowlist rejects it on the generic
/// path). Which aggregate is joined comes from the token, so one endpoint
/// serves lists, recipes and plans alike. Event first, membership second: if
/// the membership write fails the joiner retries and the append dedups on
/// `event_id`.
pub async fn join_aggregate(
    ports: &Ports<'_>,
    invites: &dyn InviteStore,
    users: &dyn UserDirectory,
    friends: &dyn FriendStore,
    caller: &UserId,
    request: JoinAggregateRequest,
) -> Result<JoinedAggregate, JoinAggregateError> {
    let invite = invites
        .invite_by_token(&request.token)
        .await?
        .ok_or(JoinAggregateError::InvalidToken)?;
    if invite.expires_at_ms <= request.now_ms {
        return Err(JoinAggregateError::InvalidToken);
    }
    let aggregate = invite.aggregate;

    if ports.membership.role_of(&aggregate, caller).await?.is_some() {
        return Ok(JoinedAggregate {
            aggregate,
            already_member: true,
        });
    }

    let members = ports.membership.members_of(&aggregate).await?;
    if members.len() >= MAX_LIST_MEMBERS {
        return Err(JoinAggregateError::ListFull);
    }

    let name = users
        .display_name(caller)
        .await?
        .unwrap_or_else(|| UNKNOWN_MEMBER_NAME.into());

    let stored = ports
        .events
        .append(
            &aggregate,
            NewEvent {
                event_type: aggregate.member_added_event().into(),
                payload: member_added_payload(&aggregate, caller, &name),
                event_id: request.event_id,
                device_id: request.device_id,
                user_id: caller.clone(),
            },
        )
        .await?;

    ports
        .membership
        .add_member(&aggregate, caller, MemberRole::Member)
        .await?;

    // Sharing something is how most friendships come about: the joiner and
    // everyone already on the list end up in each other's address book.
    // Best-effort, like the broadcast below: befriending is a side effect
    // of joining, not its condition. Propagating a transient put failure
    // here would 500 a join that already committed — and the retry's
    // already-member early-return would then skip this loop forever,
    // losing the friendships with no repair path. A silently missing
    // friendship, by contrast, is curable via the friend invite link.
    for member in &members {
        let _ = befriend(friends, caller, member).await;
    }

    let _ = ports.broadcast.publish(&aggregate.channel(), &stored).await;

    Ok(JoinedAggregate {
        aggregate,
        already_member: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::AggregateId;
    use crate::memory::{
        MemoryEventPublisher, MemoryEventStore, MemoryFriendStore, MemoryInviteStore,
        MemoryMembershipStore, MemoryUserDirectory,
    };
    use crate::ports::{EventStore, MembershipStore, StoredInvite};
    use serde_json::json;

    struct Fixture {
        store: MemoryEventStore,
        membership: MemoryMembershipStore,
        publisher: MemoryEventPublisher,
        invites: MemoryInviteStore,
        friends: MemoryFriendStore,
    }

    impl Fixture {
        fn new() -> Self {
            Self {
                store: MemoryEventStore::new(),
                membership: MemoryMembershipStore::new(),
                publisher: MemoryEventPublisher::new(),
                invites: MemoryInviteStore::new(),
                friends: MemoryFriendStore::new(),
            }
        }

        async fn with_invite(self, expires_at_ms: u64) -> Self {
            self.with_invite_to(AggregateId::list("abc"), expires_at_ms)
                .await
        }

        async fn with_invite_to(self, aggregate: AggregateId, expires_at_ms: u64) -> Self {
            self.invites
                .put_invite(&StoredInvite {
                    token: "tok-1".into(),
                    aggregate,
                    expires_at_ms,
                })
                .await
                .expect("stores");
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
    }

    fn request(token: &str, now_ms: u64) -> JoinAggregateRequest {
        JoinAggregateRequest {
            token: token.into(),
            event_id: "evt-1".into(),
            device_id: "device-1".into(),
            now_ms,
        }
    }

    #[tokio::test]
    async fn a_valid_token_appends_the_member_event_and_grants_membership() {
        let fixture = Fixture::new().with_invite(10_000).await;
        let users = MemoryUserDirectory::new().with_name("tom", "Tom");

        let joined = join_aggregate(
            &fixture.ports(),
            &fixture.invites,
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("tok-1", 1_000),
        )
        .await
        .expect("join succeeds");

        assert_eq!(joined.aggregate, AggregateId::list("abc"));
        assert!(!joined.already_member);

        let log = fixture.log().await;
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].event_type, LIST_MEMBER_ADDED);
        assert_eq!(
            log[0].payload,
            json!({ "listId": "abc", "memberId": "tom", "name": "Tom" })
        );

        let role = fixture
            .membership
            .role_of(&AggregateId::list("abc"), &UserId("tom".into()))
            .await
            .expect("readable");
        assert_eq!(role, Some(MemberRole::Member));
    }

    #[tokio::test]
    async fn an_unknown_name_falls_back_to_a_placeholder() {
        let fixture = Fixture::new().with_invite(10_000).await;
        let users = MemoryUserDirectory::new();

        join_aggregate(
            &fixture.ports(),
            &fixture.invites,
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("tok-1", 1_000),
        )
        .await
        .expect("joins");

        let log = fixture.log().await;
        assert_eq!(
            log[0].payload.get("name").and_then(|name| name.as_str()),
            Some(UNKNOWN_MEMBER_NAME)
        );
    }

    #[tokio::test]
    async fn an_existing_member_joins_idempotently_without_a_second_event() {
        let fixture = Fixture::new().with_invite(10_000).await;
        fixture
            .membership
            .add_member(
                &AggregateId::list("abc"),
                &UserId("tom".into()),
                MemberRole::Member,
            )
            .await
            .expect("member");
        let users = MemoryUserDirectory::new();

        let joined = join_aggregate(
            &fixture.ports(),
            &fixture.invites,
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("tok-1", 1_000),
        )
        .await
        .expect("idempotent");

        assert!(joined.already_member);
        assert!(fixture.log().await.is_empty());
    }

    #[tokio::test]
    async fn an_unknown_token_is_rejected() {
        let fixture = Fixture::new();
        let users = MemoryUserDirectory::new();

        let result = join_aggregate(
            &fixture.ports(),
            &fixture.invites,
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("nope", 1_000),
        )
        .await;

        assert!(matches!(result, Err(JoinAggregateError::InvalidToken)));
    }

    #[tokio::test]
    async fn an_expired_token_is_rejected_and_nothing_is_written() {
        let fixture = Fixture::new().with_invite(10_000).await;
        let users = MemoryUserDirectory::new();

        let result = join_aggregate(
            &fixture.ports(),
            &fixture.invites,
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("tok-1", 10_001),
        )
        .await;

        assert!(matches!(result, Err(JoinAggregateError::InvalidToken)));
        assert!(fixture.log().await.is_empty());
        let role = fixture
            .membership
            .role_of(&AggregateId::list("abc"), &UserId("tom".into()))
            .await
            .expect("readable");
        assert_eq!(role, None);
    }

    #[tokio::test]
    async fn a_full_list_rejects_the_next_joiner() {
        let fixture = Fixture::new().with_invite(10_000).await;
        for index in 0..MAX_LIST_MEMBERS {
            fixture
                .membership
                .add_member(
                    &AggregateId::list("abc"),
                    &UserId(format!("member-{index}")),
                    MemberRole::Member,
                )
                .await
                .expect("member");
        }
        let users = MemoryUserDirectory::new();

        let result = join_aggregate(
            &fixture.ports(),
            &fixture.invites,
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("tok-1", 1_000),
        )
        .await;

        assert!(matches!(result, Err(JoinAggregateError::ListFull)));
        assert!(fixture.log().await.is_empty());
    }

    #[tokio::test]
    async fn joining_a_recipe_writes_the_recipe_member_event_not_the_list_one() {
        let fixture = Fixture::new()
            .with_invite_to(AggregateId::recipe("bolo"), 10_000)
            .await;
        let users = MemoryUserDirectory::new().with_name("tom", "Tom");

        let joined = join_aggregate(
            &fixture.ports(),
            &fixture.invites,
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("tok-1", 1_000),
        )
        .await
        .expect("a recipe is joined like a list");

        assert_eq!(joined.aggregate, AggregateId::recipe("bolo"));

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

        let role = fixture
            .membership
            .role_of(&AggregateId::recipe("bolo"), &UserId("tom".into()))
            .await
            .expect("readable");
        assert_eq!(role, Some(MemberRole::Member));
    }

    #[tokio::test]
    async fn joining_befriends_the_newcomer_with_everyone_already_there() {
        let fixture = Fixture::new().with_invite(10_000).await;
        fixture
            .membership
            .add_member(
                &AggregateId::list("abc"),
                &UserId("mama".into()),
                MemberRole::Owner,
            )
            .await
            .expect("owner");
        let users = MemoryUserDirectory::new();

        join_aggregate(
            &fixture.ports(),
            &fixture.invites,
            &users,
            &fixture.friends,
            &UserId("tom".into()),
            request("tok-1", 1_000),
        )
        .await
        .expect("joins");

        assert!(fixture
            .friends
            .is_friend(&UserId("tom".into()), &UserId("mama".into()))
            .await
            .expect("readable"));
        assert!(fixture
            .friends
            .is_friend(&UserId("mama".into()), &UserId("tom".into()))
            .await
            .expect("readable"));
    }
}
