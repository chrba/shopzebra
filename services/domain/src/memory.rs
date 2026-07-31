//! In-memory implementations of all ports — used by the use case tests
//! and for running the domain locally. No mock framework: these are
//! real, tiny implementations of the same contracts.

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::event::{AggregateId, NewEvent, Position, StoredEvent, UserId};
use crate::ports::{
    EventPublisher, EventStore, InviteStore, MemberRole, MembershipStore, StoreError, StoredInvite,
    UserDirectory,
};

// --- Event store ---

#[derive(Default)]
struct EventLog {
    events_by_partition: HashMap<String, Vec<StoredEvent>>,
}

#[derive(Default)]
pub struct MemoryEventStore {
    log: Mutex<EventLog>,
}

impl MemoryEventStore {
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl EventStore for MemoryEventStore {
    async fn append(
        &self,
        aggregate: &AggregateId,
        event: NewEvent,
    ) -> Result<StoredEvent, StoreError> {
        let mut log = self.log.lock().expect("event log lock");
        let partition = log
            .events_by_partition
            .entry(aggregate.partition_key())
            .or_default();

        if let Some(existing) = partition
            .iter()
            .find(|stored| stored.event_id == event.event_id)
        {
            return Ok(existing.clone());
        }

        let stored = StoredEvent {
            // The log is gap-free, so the next position is simply its
            // length + 1 — the same contract the DynamoDB adapter
            // enforces with conditional puts.
            position: Position(partition.len() as u64 + 1),
            event_type: event.event_type,
            payload: event.payload,
            event_id: event.event_id,
            device_id: event.device_id,
            user_id: event.user_id,
        };
        partition.push(stored.clone());
        Ok(stored)
    }

    async fn events_since(
        &self,
        aggregate: &AggregateId,
        since: Option<&Position>,
    ) -> Result<Vec<StoredEvent>, StoreError> {
        let log = self.log.lock().expect("event log lock");
        let events = log
            .events_by_partition
            .get(&aggregate.partition_key())
            .map(|partition| {
                partition
                    .iter()
                    .filter(|stored| since.is_none_or(|cursor| stored.position > *cursor))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        Ok(events)
    }
}

// --- Membership ---

#[derive(Default)]
pub struct MemoryMembershipStore {
    roles: Mutex<HashMap<(String, String), MemberRole>>,
}

impl MemoryMembershipStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn with_member(self, aggregate: &AggregateId, user: &UserId, role: MemberRole) -> Self {
        self.add_member(aggregate, user, role)
            .await
            .expect("in-memory add_member cannot fail");
        self
    }
}

#[async_trait]
impl MembershipStore for MemoryMembershipStore {
    async fn claim_ownership(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<bool, StoreError> {
        let mut roles = self.roles.lock().expect("membership lock");
        let already_owned = roles
            .iter()
            .any(|((partition, _), role)| {
                partition == &aggregate.partition_key() && *role == MemberRole::Owner
            });
        if already_owned {
            return Ok(false);
        }
        roles.insert((aggregate.partition_key(), user.0.clone()), MemberRole::Owner);
        Ok(true)
    }

    async fn role_of(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<Option<MemberRole>, StoreError> {
        let roles = self.roles.lock().expect("membership lock");
        Ok(roles.get(&(aggregate.partition_key(), user.0.clone())).copied())
    }

    async fn owner_of(&self, aggregate: &AggregateId) -> Result<Option<UserId>, StoreError> {
        let roles = self.roles.lock().expect("membership lock");
        Ok(roles
            .iter()
            .find(|((partition, _), role)| {
                partition == &aggregate.partition_key() && **role == MemberRole::Owner
            })
            .map(|((_, user), _)| UserId(user.clone())))
    }

    async fn add_member(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
        role: MemberRole,
    ) -> Result<(), StoreError> {
        let mut roles = self.roles.lock().expect("membership lock");
        roles.insert((aggregate.partition_key(), user.0.clone()), role);
        Ok(())
    }

    async fn remove_member(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<(), StoreError> {
        let mut roles = self.roles.lock().expect("membership lock");
        roles.remove(&(aggregate.partition_key(), user.0.clone()));
        Ok(())
    }

    async fn aggregates_of(&self, user: &UserId) -> Result<Vec<AggregateId>, StoreError> {
        let roles = self.roles.lock().expect("membership lock");
        let aggregates = roles
            .keys()
            .filter(|(_, member)| member == &user.0)
            .filter_map(|(partition, _)| partition.strip_prefix("LIST#").map(AggregateId::list))
            .collect();
        Ok(aggregates)
    }
}

// --- Invites ---

#[derive(Default)]
pub struct MemoryInviteStore {
    invites: Mutex<Vec<StoredInvite>>,
}

impl MemoryInviteStore {
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl InviteStore for MemoryInviteStore {
    async fn invite_for(&self, aggregate: &AggregateId) -> Result<Option<StoredInvite>, StoreError> {
        let invites = self.invites.lock().expect("invites lock");
        Ok(invites
            .iter()
            .find(|invite| invite.aggregate == *aggregate)
            .cloned())
    }

    async fn invite_by_token(&self, token: &str) -> Result<Option<StoredInvite>, StoreError> {
        let invites = self.invites.lock().expect("invites lock");
        Ok(invites.iter().find(|invite| invite.token == token).cloned())
    }

    async fn put_invite(&self, invite: &StoredInvite) -> Result<(), StoreError> {
        let mut invites = self.invites.lock().expect("invites lock");
        invites.retain(|stored| stored.aggregate != invite.aggregate);
        invites.push(invite.clone());
        Ok(())
    }
}

// --- User directory ---

#[derive(Default)]
pub struct MemoryUserDirectory {
    names: HashMap<String, String>,
}

impl MemoryUserDirectory {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_name(mut self, user_id: &str, name: &str) -> Self {
        self.names.insert(user_id.into(), name.into());
        self
    }
}

#[async_trait]
impl UserDirectory for MemoryUserDirectory {
    async fn display_name(&self, user: &UserId) -> Result<Option<String>, StoreError> {
        Ok(self.names.get(&user.0).cloned())
    }
}

// --- Publisher ---

#[derive(Default)]
pub struct MemoryEventPublisher {
    published: Mutex<Vec<(String, StoredEvent)>>,
}

impl MemoryEventPublisher {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn published_channels(&self) -> Vec<String> {
        let published = self.published.lock().expect("published lock");
        published.iter().map(|(channel, _)| channel.clone()).collect()
    }
}

#[async_trait]
impl EventPublisher for MemoryEventPublisher {
    async fn publish(&self, channel: &str, event: &StoredEvent) -> Result<(), StoreError> {
        let mut published = self.published.lock().expect("published lock");
        published.push((channel.to_string(), event.clone()));
        Ok(())
    }
}

#[cfg(test)]
mod invite_and_directory_tests {
    use super::*;
    use crate::ports::{InviteStore, StoredInvite, UserDirectory};

    #[tokio::test]
    async fn an_invite_is_findable_by_aggregate_and_by_token() {
        let invites = MemoryInviteStore::new();
        let invite = StoredInvite {
            token: "tok-1".into(),
            aggregate: AggregateId::list("abc"),
            expires_at_ms: 42,
        };

        invites.put_invite(&invite).await.expect("stores");

        let by_list = invites
            .invite_for(&AggregateId::list("abc"))
            .await
            .expect("readable");
        let by_token = invites.invite_by_token("tok-1").await.expect("readable");
        assert_eq!(by_list, Some(invite.clone()));
        assert_eq!(by_token, Some(invite));
    }

    #[tokio::test]
    async fn a_new_invite_replaces_the_previous_one_of_the_same_list() {
        let invites = MemoryInviteStore::new();
        invites
            .put_invite(&StoredInvite {
                token: "tok-1".into(),
                aggregate: AggregateId::list("abc"),
                expires_at_ms: 1,
            })
            .await
            .expect("stores");

        invites
            .put_invite(&StoredInvite {
                token: "tok-2".into(),
                aggregate: AggregateId::list("abc"),
                expires_at_ms: 2,
            })
            .await
            .expect("stores");

        let current = invites
            .invite_for(&AggregateId::list("abc"))
            .await
            .expect("readable");
        assert_eq!(current.map(|invite| invite.token), Some("tok-2".into()));
    }

    #[tokio::test]
    async fn an_unknown_token_resolves_to_nothing() {
        let invites = MemoryInviteStore::new();

        let found = invites.invite_by_token("nope").await.expect("readable");

        assert_eq!(found, None);
    }

    #[tokio::test]
    async fn the_directory_returns_the_stored_name_or_none() {
        let users = MemoryUserDirectory::new().with_name("u1", "Sarah");

        assert_eq!(
            users
                .display_name(&UserId("u1".into()))
                .await
                .expect("readable"),
            Some("Sarah".into())
        );
        assert_eq!(
            users
                .display_name(&UserId("u2".into()))
                .await
                .expect("readable"),
            None
        );
    }
}
