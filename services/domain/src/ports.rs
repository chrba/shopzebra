use async_trait::async_trait;
use thiserror::Error;

use crate::event::{AggregateId, NewEvent, StoredEvent, Ulid, UserId};

#[derive(Debug, Error)]
#[error("store unavailable: {0}")]
pub struct StoreError(pub String);

#[async_trait]
pub trait EventStore: Send + Sync {
    /// Appends with a server-assigned ULID.
    ///
    /// Contract (implemented by the DynamoDB adapter via conditional puts):
    /// - the assigned ULID is strictly greater than every ULID already
    ///   stored for this aggregate — otherwise `GET /sync?since=<cursor>`
    ///   could permanently miss events (sync-engine.md §6)
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
        since: Option<&Ulid>,
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

    /// All aggregates the user is a member of — the scope of `GET /sync`.
    async fn aggregates_of(&self, user: &UserId) -> Result<Vec<AggregateId>, StoreError>;
}

/// Real-time broadcast (AppSync Events). Best-effort: the cursor catch-up
/// is the reliable delivery path, this is only the latency optimization.
#[async_trait]
pub trait EventPublisher: Send + Sync {
    async fn publish(&self, channel: &str, event: &StoredEvent) -> Result<(), StoreError>;
}
