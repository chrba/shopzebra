//! In-memory implementations of all ports — used by the use case tests
//! and for running the domain locally. No mock framework: these are
//! real, tiny implementations of the same contracts.

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::event::{AggregateId, NewEvent, StoredEvent, Ulid, UserId};
use crate::ports::{EventPublisher, EventStore, MemberRole, MembershipStore, StoreError};

// --- Event store ---

#[derive(Default)]
struct EventLog {
    events_by_partition: HashMap<String, Vec<StoredEvent>>,
    ulid_counter: u64,
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
            // Zero-padded counter: lexicographically sortable and strictly
            // monotonic — the same contract the DynamoDB adapter provides
            // with real ULIDs.
            ulid: Ulid(format!("{:026}", {
                log.ulid_counter += 1;
                log.ulid_counter
            })),
            event_type: event.event_type,
            payload: event.payload,
            event_id: event.event_id,
            device_id: event.device_id,
            user_id: event.user_id,
        };
        log.events_by_partition
            .entry(aggregate.partition_key())
            .or_default()
            .push(stored.clone());
        Ok(stored)
    }

    async fn events_since(
        &self,
        aggregate: &AggregateId,
        since: Option<&Ulid>,
    ) -> Result<Vec<StoredEvent>, StoreError> {
        let log = self.log.lock().expect("event log lock");
        let events = log
            .events_by_partition
            .get(&aggregate.partition_key())
            .map(|partition| {
                partition
                    .iter()
                    .filter(|stored| since.is_none_or(|cursor| stored.ulid > *cursor))
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
    async fn role_of(
        &self,
        aggregate: &AggregateId,
        user: &UserId,
    ) -> Result<Option<MemberRole>, StoreError> {
        let roles = self.roles.lock().expect("membership lock");
        Ok(roles.get(&(aggregate.partition_key(), user.0.clone())).copied())
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
