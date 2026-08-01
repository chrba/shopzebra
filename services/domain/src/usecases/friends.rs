//! The address book: invite, accept, read, remove.
//!
//! Friendships are a projection, not an event log — user-scoped, never in
//! conflict, nobody folds them. That is why nothing here touches the
//! envelope allowlist, the aggregates or the sync engine.

use thiserror::Error;

use crate::event::UserId;
use crate::limits::INVITE_TTL_MS;
use crate::ports::{FriendInviteStore, FriendStore, StoreError, StoredFriendInvite, UserDirectory};

#[derive(Debug, Error)]
pub enum FriendError {
    /// Unknown and expired tokens collapse into one error on purpose.
    #[error("invalid or expired friend invite token")]
    InvalidToken,
    /// Accepting your own link would make you your own friend.
    #[error("you cannot accept your own invite")]
    OwnInvite,
    #[error(transparent)]
    Store(#[from] StoreError),
}

/// One entry of the address book as the screen needs it.
#[derive(Debug, PartialEq, Eq)]
pub struct Friend {
    pub id: String,
    /// None when the user set no name — the client decides on the fallback.
    pub name: Option<String>,
}

/// Mints the caller's friendship link. One active token per user, reused
/// while valid, so the link stays stable across screen visits — same rule as
/// the list invite.
pub async fn create_friend_invite(
    invites: &dyn FriendInviteStore,
    caller: &UserId,
    fresh_token: String,
    now_ms: u64,
) -> Result<StoredFriendInvite, FriendError> {
    if let Some(active) = invites.friend_invite_for(caller).await? {
        if active.expires_at_ms > now_ms {
            return Ok(active);
        }
    }

    let invite = StoredFriendInvite {
        token: fresh_token,
        invited_by: caller.clone(),
        expires_at_ms: now_ms + INVITE_TTL_MS,
    };
    invites.put_friend_invite(&invite).await?;
    Ok(invite)
}

/// Accepting writes **both** directions: the two are now in each other's
/// address book. Removing later only ever deletes one of them.
pub async fn accept_friend_invite(
    invites: &dyn FriendInviteStore,
    friends: &dyn FriendStore,
    caller: &UserId,
    token: &str,
    now_ms: u64,
) -> Result<UserId, FriendError> {
    let invite = invites
        .friend_invite_by_token(token)
        .await?
        .ok_or(FriendError::InvalidToken)?;
    if invite.expires_at_ms <= now_ms {
        return Err(FriendError::InvalidToken);
    }
    if invite.invited_by == *caller {
        return Err(FriendError::OwnInvite);
    }

    befriend(friends, caller, &invite.invited_by).await?;
    Ok(invite.invited_by)
}

/// Makes two users know each other, in both address books. Idempotent.
/// Also called when somebody joins a list — sharing something is how most
/// friendships come about.
pub async fn befriend(
    friends: &dyn FriendStore,
    a: &UserId,
    b: &UserId,
) -> Result<(), StoreError> {
    if a == b {
        return Ok(());
    }
    friends.add_friend(a, b).await?;
    friends.add_friend(b, a).await
}

/// The caller's address book, with display names from the identity provider.
pub async fn my_friends(
    friends: &dyn FriendStore,
    users: &dyn UserDirectory,
    caller: &UserId,
) -> Result<Vec<Friend>, StoreError> {
    let ids = friends.friends_of(caller).await?;
    let mut entries = Vec::with_capacity(ids.len());
    for id in ids {
        let name = users.display_name(&id).await?;
        entries.push(Friend { id: id.0, name });
    }
    Ok(entries)
}

/// Removes only the caller's own direction. An address book is personal:
/// one side tidying up must not change the other side's list. Shared lists
/// stay untouched — dropping somebody here never revokes access.
pub async fn remove_friend(
    friends: &dyn FriendStore,
    caller: &UserId,
    friend: &UserId,
) -> Result<(), StoreError> {
    friends.remove_friend(caller, friend).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{MemoryFriendInviteStore, MemoryFriendStore, MemoryUserDirectory};

    fn user(id: &str) -> UserId {
        UserId(id.into())
    }

    #[tokio::test]
    async fn a_repeated_create_reuses_the_active_token() {
        let invites = MemoryFriendInviteStore::new();
        create_friend_invite(&invites, &user("sarah"), "tok-1".into(), 1_000)
            .await
            .expect("first");

        let second = create_friend_invite(&invites, &user("sarah"), "tok-2".into(), 2_000)
            .await
            .expect("second");

        assert_eq!(second.token, "tok-1");
        assert_eq!(second.expires_at_ms, 1_000 + INVITE_TTL_MS);
    }

    #[tokio::test]
    async fn an_expired_token_is_replaced() {
        let invites = MemoryFriendInviteStore::new();
        create_friend_invite(&invites, &user("sarah"), "tok-1".into(), 0)
            .await
            .expect("first");

        let fresh = create_friend_invite(
            &invites,
            &user("sarah"),
            "tok-2".into(),
            INVITE_TTL_MS + 1,
        )
        .await
        .expect("replaces");

        assert_eq!(fresh.token, "tok-2");
    }

    #[tokio::test]
    async fn accepting_puts_each_into_the_others_address_book() {
        let invites = MemoryFriendInviteStore::new();
        let friends = MemoryFriendStore::new();
        create_friend_invite(&invites, &user("sarah"), "tok-1".into(), 0)
            .await
            .expect("invite");

        let inviter = accept_friend_invite(&invites, &friends, &user("tom"), "tok-1", 1_000)
            .await
            .expect("accepts");

        assert_eq!(inviter, user("sarah"));
        assert!(friends
            .is_friend(&user("tom"), &user("sarah"))
            .await
            .expect("readable"));
        assert!(friends
            .is_friend(&user("sarah"), &user("tom"))
            .await
            .expect("readable"));
    }

    #[tokio::test]
    async fn an_unknown_token_is_rejected() {
        let invites = MemoryFriendInviteStore::new();
        let friends = MemoryFriendStore::new();

        let result = accept_friend_invite(&invites, &friends, &user("tom"), "nope", 0).await;

        assert!(matches!(result, Err(FriendError::InvalidToken)));
    }

    #[tokio::test]
    async fn an_expired_token_is_rejected() {
        let invites = MemoryFriendInviteStore::new();
        let friends = MemoryFriendStore::new();
        create_friend_invite(&invites, &user("sarah"), "tok-1".into(), 0)
            .await
            .expect("invite");

        let result = accept_friend_invite(
            &invites,
            &friends,
            &user("tom"),
            "tok-1",
            INVITE_TTL_MS + 1,
        )
        .await;

        assert!(matches!(result, Err(FriendError::InvalidToken)));
    }

    #[tokio::test]
    async fn nobody_befriends_themselves_through_their_own_link() {
        let invites = MemoryFriendInviteStore::new();
        let friends = MemoryFriendStore::new();
        create_friend_invite(&invites, &user("sarah"), "tok-1".into(), 0)
            .await
            .expect("invite");

        let result = accept_friend_invite(&invites, &friends, &user("sarah"), "tok-1", 1).await;

        assert!(matches!(result, Err(FriendError::OwnInvite)));
        assert!(friends
            .friends_of(&user("sarah"))
            .await
            .expect("readable")
            .is_empty());
    }

    #[tokio::test]
    async fn the_address_book_carries_display_names() {
        let friends = MemoryFriendStore::new().with_friendship("sarah", "tom").await;
        let users = MemoryUserDirectory::new().with_name("tom", "Tom");

        let entries = my_friends(&friends, &users, &user("sarah"))
            .await
            .expect("readable");

        assert_eq!(
            entries,
            vec![Friend {
                id: "tom".into(),
                name: Some("Tom".into())
            }]
        );
    }

    #[tokio::test]
    async fn a_friend_without_a_name_yields_none() {
        let friends = MemoryFriendStore::new().with_friendship("sarah", "tom").await;
        let users = MemoryUserDirectory::new();

        let entries = my_friends(&friends, &users, &user("sarah"))
            .await
            .expect("readable");

        assert_eq!(entries[0].name, None);
    }

    #[tokio::test]
    async fn removing_touches_only_the_callers_own_side() {
        let friends = MemoryFriendStore::new().with_friendship("sarah", "tom").await;

        remove_friend(&friends, &user("sarah"), &user("tom"))
            .await
            .expect("removes");

        assert!(!friends
            .is_friend(&user("sarah"), &user("tom"))
            .await
            .expect("readable"));
        // Tom tidying up is Tom's business — Sarah's removal leaves his
        // address book alone.
        assert!(friends
            .is_friend(&user("tom"), &user("sarah"))
            .await
            .expect("readable"));
    }

    #[tokio::test]
    async fn befriending_twice_creates_no_duplicates() {
        let friends = MemoryFriendStore::new();

        befriend(&friends, &user("sarah"), &user("tom"))
            .await
            .expect("first");
        befriend(&friends, &user("sarah"), &user("tom"))
            .await
            .expect("second");

        assert_eq!(
            friends.friends_of(&user("sarah")).await.expect("readable"),
            vec![user("tom")]
        );
    }
}
