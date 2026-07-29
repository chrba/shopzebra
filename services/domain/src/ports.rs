use async_trait::async_trait;
use thiserror::Error;

use crate::event::{AggregateId, NewEvent, Position, StoredEvent, UserId};

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
        aggregate: &AggregateId,
        event: NewEvent,
    ) -> Result<StoredEvent, StoreError>;

    async fn events_since(
        &self,
        aggregate: &AggregateId,
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
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<Option<MemberRole>, StoreError>;

    /// Atomically claims ownership of a fresh aggregate: the creator
    /// becomes owner and first member. Returns false when the aggregate
    /// already has an owner (concurrent create or id collision).
    async fn claim_ownership(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<bool, StoreError>;

    async fn add_member(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
        role: MemberRole,
    ) -> Result<(), StoreError>;

    async fn remove_member(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<(), StoreError>;

    /// All aggregates the user is a member of — the fan-out for the
    /// per-list cursor catch-up. Contract: **each aggregate exactly
    /// once**, regardless of how many rows the projection keeps per
    /// membership. A duplicate here makes every consumer fetch and
    /// fold the same log twice.
    async fn aggregates_of(&self, user: &UserId) -> Result<Vec<AggregateId>, StoreError>;
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
