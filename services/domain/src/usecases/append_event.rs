use serde_json::Value;
use thiserror::Error;

use crate::envelope::{validate_envelope, EnvelopeError};
use crate::event::{AggregateId, NewEvent, StoredEvent, UserId};
use crate::membership::{check_can_append, MembershipViolation};
use crate::ports::{Ports, StoreError};

#[derive(Debug, Error)]
pub enum AppendEventError {
    #[error(transparent)]
    Forbidden(#[from] MembershipViolation),
    #[error(transparent)]
    InvalidEnvelope(#[from] EnvelopeError),
    #[error(transparent)]
    Store(#[from] StoreError),
}

/// What the driving adapter extracts from the HTTP request.
/// `event_id`/`device_id` come from the client meta (idempotency);
/// the caller identity always comes from the verified JWT.
#[derive(Debug)]
pub struct AppendEventRequest {
    pub event_type: String,
    pub payload: Value,
    pub event_id: String,
    pub device_id: String,
}

/// Class 1, generic for every aggregate: check membership, validate form,
/// append at the server-assigned position, broadcast (sync-engine.md §6).
pub async fn append_event(
    ports: &Ports<'_>,
    caller: &UserId,
    aggregate: &AggregateId,
    request: AppendEventRequest,
) -> Result<StoredEvent, AppendEventError> {
    let role = ports.membership.role_of(aggregate, caller).await?;
    check_can_append(role)?;

    let validated = validate_envelope(aggregate, &request.event_type, request.payload)?;

    let stored = ports
        .events
        .append(
            aggregate,
            NewEvent {
                event_type: validated.event_type,
                payload: validated.payload,
                event_id: request.event_id,
                device_id: request.device_id,
                user_id: caller.clone(),
            },
        )
        .await?;

    // Best-effort: the cursor catch-up is the reliable delivery path,
    // AppSync only cuts latency. A failed broadcast must not fail an
    // append that is already in the canonical log.
    let _ = ports.broadcast.publish(&aggregate.channel(), &stored).await;

    Ok(stored)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{MemoryEventPublisher, MemoryEventStore, MemoryMembershipStore};
    use crate::ports::{EventStore, MemberRole};
    use serde_json::json;

    fn groceries() -> AggregateId {
        AggregateId::list("abc")
    }

    fn mama() -> UserId {
        UserId("mama".into())
    }

    fn rename_request(event_id: &str) -> AppendEventRequest {
        AppendEventRequest {
            event_type: "lists/listRenamed".into(),
            payload: json!({ "listId": "abc", "name": "Großeinkauf" }),
            event_id: event_id.into(),
            device_id: "device-1".into(),
        }
    }

    fn wired<'a>(
        store: &'a MemoryEventStore,
        membership: &'a MemoryMembershipStore,
        publisher: &'a MemoryEventPublisher,
    ) -> Ports<'a> {
        Ports { events: store, membership, broadcast: publisher }
    }

    async fn members_only_store() -> MemoryMembershipStore {
        MemoryMembershipStore::new()
            .with_member(&groceries(), &mama(), MemberRole::Member)
            .await
    }

    #[tokio::test]
    async fn a_member_appends_and_the_event_is_broadcast() {
        let store = MemoryEventStore::new();
        let membership = members_only_store().await;
        let publisher = MemoryEventPublisher::new();

        let stored = append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), rename_request("event-1"))
            .await
            .expect("append succeeds");

        assert_eq!(stored.user_id, mama());
        assert_eq!(publisher.published_channels(), vec!["lists/abc".to_string()]);
    }

    #[tokio::test]
    async fn a_stranger_is_rejected_and_nothing_is_stored() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();

        let result = append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), rename_request("event-1")).await;

        assert!(matches!(result, Err(AppendEventError::Forbidden(_))));
        let log = store.events_since(&groceries(), None).await.expect("readable");
        assert!(log.is_empty());
        assert!(publisher.published_channels().is_empty());
    }

    #[tokio::test]
    async fn an_invalid_payload_is_rejected_and_nothing_is_stored() {
        let store = MemoryEventStore::new();
        let membership = members_only_store().await;
        let publisher = MemoryEventPublisher::new();
        let garbage = AppendEventRequest {
            event_type: "shopping/itemAdded".into(),
            payload: json!({ "listId": "abc", "itemId": "apples", "quantity": "drei" }),
            event_id: "event-1".into(),
            device_id: "device-1".into(),
        };

        let result = append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), garbage).await;

        assert!(matches!(result, Err(AppendEventError::InvalidEnvelope(_))));
        let log = store.events_since(&groceries(), None).await.expect("readable");
        assert!(log.is_empty());
    }

    #[tokio::test]
    async fn positions_are_strictly_monotonic_per_aggregate() {
        let store = MemoryEventStore::new();
        let membership = members_only_store().await;
        let publisher = MemoryEventPublisher::new();

        let first = append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), rename_request("event-1"))
            .await
            .expect("append succeeds");
        let second = append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), rename_request("event-2"))
            .await
            .expect("append succeeds");

        assert!(second.position > first.position);
    }

    #[tokio::test]
    async fn a_retried_event_id_does_not_append_twice() {
        let store = MemoryEventStore::new();
        let membership = members_only_store().await;
        let publisher = MemoryEventPublisher::new();

        let first = append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), rename_request("event-1"))
            .await
            .expect("append succeeds");
        let retried = append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), rename_request("event-1"))
            .await
            .expect("retry succeeds");

        assert_eq!(retried.position, first.position);
        let log = store.events_since(&groceries(), None).await.expect("readable");
        assert_eq!(log.len(), 1);
    }

    #[tokio::test]
    async fn events_since_returns_only_events_after_the_cursor() {
        let store = MemoryEventStore::new();
        let membership = members_only_store().await;
        let publisher = MemoryEventPublisher::new();

        let first = append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), rename_request("event-1"))
            .await
            .expect("append succeeds");
        append_event(&wired(&store, &membership, &publisher), &mama(), &groceries(), rename_request("event-2"))
            .await
            .expect("append succeeds");

        let tail = store
            .events_since(&groceries(), Some(&first.position))
            .await
            .expect("readable");

        assert_eq!(tail.len(), 1);
        assert_eq!(tail[0].event_id, "event-2");
    }
}
