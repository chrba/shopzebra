use thiserror::Error;

use crate::event::{Aggregate, Position, StoredEvent, UserId};
use crate::membership::{check_can_read, MembershipViolation};
use crate::ports::{Ports, StoreError};

#[derive(Debug, Error)]
pub enum GetEventsError {
    #[error(transparent)]
    Forbidden(#[from] MembershipViolation),
    #[error(transparent)]
    Store(#[from] StoreError),
}

/// Cursor catch-up for one aggregate log: any member reads everything
/// after the position it already holds. `after: None` reads the whole
/// log — the bootstrap of a new device (sync-engine.md §4).
pub async fn get_events(
    ports: &Ports<'_>,
    caller_id: &UserId,
    aggregate: &Aggregate,
    after: Option<Position>,
) -> Result<Vec<StoredEvent>, GetEventsError> {
    let role = ports.membership.role_of(aggregate, caller_id).await?;
    check_can_read(role)?;

    Ok(ports.events.events_since(aggregate, after.as_ref()).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{MemoryEventPublisher, MemoryEventStore, MemoryMembershipStore};
    use crate::ports::MemberRole;
    use crate::usecases::append_event::{append_event, AppendEventRequest};
    use serde_json::json;

    fn groceries() -> Aggregate {
        Aggregate::list("abc")
    }

    fn mama() -> UserId {
        UserId("mama".into())
    }

    fn wired<'a>(
        store: &'a MemoryEventStore,
        membership: &'a MemoryMembershipStore,
        publisher: &'a MemoryEventPublisher,
    ) -> Ports<'a> {
        Ports { events: store, membership, broadcast: publisher }
    }

    fn rename_request(event_id: &str) -> AppendEventRequest {
        AppendEventRequest {
            event_type: "lists/listRenamed".into(),
            payload: json!({ "listId": "abc", "name": "Großeinkauf" }),
            event_id: event_id.into(),
            device_id: "device-1".into(),
        }
    }

    #[tokio::test]
    async fn a_member_reads_everything_after_its_cursor() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new()
            .with_member(&groceries(), &mama(), MemberRole::Member)
            .await;
        let publisher = MemoryEventPublisher::new();
        let ports = wired(&store, &membership, &publisher);

        let first = append_event(&ports, &mama(), &groceries(), rename_request("event-1"))
            .await
            .expect("append succeeds");
        append_event(&ports, &mama(), &groceries(), rename_request("event-2"))
            .await
            .expect("append succeeds");

        let whole_log = get_events(&ports, &mama(), &groceries(), None)
            .await
            .expect("member may read");
        let tail = get_events(&ports, &mama(), &groceries(), Some(first.position))
            .await
            .expect("member may read");

        assert_eq!(whole_log.len(), 2);
        assert_eq!(tail.len(), 1);
        assert_eq!(tail[0].event_id, "event-2");
    }

    #[tokio::test]
    async fn a_stranger_may_not_read_the_log() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();
        let ports = wired(&store, &membership, &publisher);

        let result = get_events(&ports, &mama(), &groceries(), None).await;

        assert!(matches!(result, Err(GetEventsError::Forbidden(_))));
    }
}
