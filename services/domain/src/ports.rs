use async_trait::async_trait;
use thiserror::Error;

use crate::event::{Aggregate, NewEvent, Position, StoredEvent, UserId};

#[derive(Debug, Error)]
#[error("store unavailable: {0}")]
pub struct StoreError(pub String);

#[async_trait]
pub trait EventStore: Send + Sync {
    /// Appends at the next position of the aggregate log.
    ///
    /// Contract (implemented by the DynamoDB adapter via conditional puts):
    /// - the assigned position is strictly greater than every position
    ///   already stored for this aggregate — otherwise
    ///   `GET /sync?since=<cursor>` could permanently miss events
    ///   (sync-engine.md §6). Positions are gap-free, so clients can
    ///   detect missing events
    /// - a duplicate `event_id` never appends twice; the already stored
    ///   event is returned so client retries are safe
    async fn append(
        &self,
        aggregate: &Aggregate,
        event: NewEvent,
    ) -> Result<StoredEvent, StoreError>;

    async fn events_since(
        &self,
        aggregate: &Aggregate,
        since: Option<&Position>,
    ) -> Result<Vec<StoredEvent>, StoreError>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemberRole {
    Owner,
    Member,
}

/// The server-owned membership projection — the authorization basis.
/// Never derived from client-written events (sync-engine.md §6).
#[async_trait]
pub trait MembershipStore: Send + Sync {
    async fn role_of(
        &self,
        aggregate: &Aggregate,
        user_id: &UserId,
    ) -> Result<Option<MemberRole>, StoreError>;

    /// Atomically claims ownership of a fresh aggregate: the creator
    /// becomes owner and first member. Returns false when the aggregate
    /// already has an owner (concurrent create or id collision).
    async fn claim_ownership(
        &self,
        aggregate: &Aggregate,
        user_id: &UserId,
    ) -> Result<bool, StoreError>;

    /// Who owns this aggregate. Needed to show the owner by name: the
    /// owner never triggers a `listMemberAdded` for themselves, so their
    /// name reaches other devices through the list projection instead.
    async fn owner_of(&self, aggregate: &Aggregate) -> Result<Option<UserId>, StoreError>;

    async fn add_member(
        &self,
        aggregate: &Aggregate,
        user_id: &UserId,
        role: MemberRole,
    ) -> Result<(), StoreError>;

    async fn remove_member(
        &self,
        aggregate: &Aggregate,
        user_id: &UserId,
    ) -> Result<(), StoreError>;

    /// Everyone on this aggregate. Needed to enforce the member cap and to
    /// befriend a joiner with the people already there.
    async fn members_of(&self, aggregate: &Aggregate) -> Result<Vec<UserId>, StoreError>;

    /// All aggregates the user is a member of — the fan-out for the
    /// per-list cursor catch-up. Contract: **each aggregate exactly
    /// once**, regardless of how many rows the projection keeps per
    /// membership. A duplicate here makes every consumer fetch and
    /// fold the same log twice.
    async fn aggregates_of(&self, user_id: &UserId) -> Result<Vec<Aggregate>, StoreError>;
}

/// Real-time broadcast (AppSync Events). Best-effort: the cursor catch-up
/// is the reliable delivery path, this is only the latency optimization.
#[async_trait]
pub trait EventPublisher: Send + Sync {
    async fn publish(&self, channel: &str, event: &StoredEvent) -> Result<(), StoreError>;
}

/// The driven side of the hexagon as one wiring unit — everything the
/// use cases reach for. Wired once per lambda cold start; use cases
/// receive `&Ports` plus the per-request data (caller, aggregate,
/// request), keeping wiring and data visibly separate.
pub struct Ports<'a> {
    pub events: &'a dyn EventStore,
    pub membership: &'a dyn MembershipStore,
    pub broadcast: &'a dyn EventPublisher,
}

/// One active invite of a list. Both lookups — by aggregate for reuse on
/// a repeated create, by token for the join — return the same value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredInvite {
    pub token: String,
    pub aggregate: Aggregate,
    pub expires_at_ms: u64,
}

#[async_trait]
pub trait InviteStore: Send + Sync {
    /// The list's current invite, if any. Lets a repeated create hand out
    /// the same token, so link and QR stay stable across screen visits.
    async fn invite_for(&self, aggregate: &Aggregate) -> Result<Option<StoredInvite>, StoreError>;

    /// Resolves a token to its invite — the joiner knows nothing else.
    async fn invite_by_token(&self, token: &str) -> Result<Option<StoredInvite>, StoreError>;

    /// Stores an invite, replacing the list's previous one.
    async fn put_invite(&self, invite: &StoredInvite) -> Result<(), StoreError>;
}

/// Display names of authenticated users. Backed by the identity provider,
/// never by client input — the name travels in server-written class-2
/// events and must be trustworthy.
#[async_trait]
pub trait UserDirectory: Send + Sync {
    /// None when the user set no name yet; callers fall back.
    async fn display_name(&self, user_id: &UserId) -> Result<Option<String>, StoreError>;
}

/// A pending friendship invite. Unlike `StoredInvite` it has no aggregate —
/// a friendship belongs to no list, which is exactly why it is a separate
/// type instead of a widened one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredFriendInvite {
    pub token: String,
    pub invited_by: UserId,
    pub expires_at_ms: u64,
}

#[async_trait]
pub trait FriendInviteStore: Send + Sync {
    /// The inviter's current token, if any — a repeated create reuses it.
    async fn friend_invite_for(&self, user_id: &UserId) -> Result<Option<StoredFriendInvite>, StoreError>;
    async fn friend_invite_by_token(&self, token: &str) -> Result<Option<StoredFriendInvite>, StoreError>;
    async fn put_friend_invite(&self, invite: &StoredFriendInvite) -> Result<(), StoreError>;
}

/// The address book. Deliberately NOT an event log: friendships are
/// user-scoped, never conflict and nobody folds them.
///
/// Each direction is its own entry. Accepting writes both, removing deletes
/// only the caller's own — an address book is personal, so one side tidying
/// up must not change the other side's list.
#[async_trait]
pub trait FriendStore: Send + Sync {
    async fn friends_of(&self, user_id: &UserId) -> Result<Vec<UserId>, StoreError>;
    async fn is_friend(&self, user_id: &UserId, other_id: &UserId) -> Result<bool, StoreError>;
    /// Writes one direction. Callers that mean "they became friends" call it twice.
    async fn add_friend(&self, user_id: &UserId, friend_id: &UserId) -> Result<(), StoreError>;
    async fn remove_friend(&self, user_id: &UserId, friend_id: &UserId) -> Result<(), StoreError>;
}
