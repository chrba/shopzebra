use serde_json::Value;
use thiserror::Error;

use crate::envelope::{validate_envelope, EnvelopeError};
use crate::event::{Aggregate, NewEvent, StoredEvent, UserId};
use crate::ports::{Ports, StoreError};

#[derive(Debug, Error)]
pub enum CreateListError {
    #[error(transparent)]
    InvalidEnvelope(#[from] EnvelopeError),
    /// The creator becomes the owner — a payload claiming somebody else
    /// created the list is attribution spoofing.
    #[error("createdBy must be the authenticated caller")]
    CreatorMustBeCaller,
    #[error("a list with this id already exists")]
    AlreadyExists,
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct CreateListRequest {
    pub payload: Value,
    pub event_id: String,
    pub device_id: String,
}

/// Class 2: `listCreated` bootstraps the authorization root of a list —
/// the server claims ownership for the caller atomically, then writes
/// the event itself (POST /lists, not the generic append path).
pub async fn create_list(
    ports: &Ports<'_>,
    caller_id: &UserId,
    request: CreateListRequest,
) -> Result<StoredEvent, CreateListError> {
    let list_id = request
        .payload
        .get("listId")
        .and_then(Value::as_str)
        .ok_or_else(|| EnvelopeError::SchemaViolation("listId is required".into()))?
        .to_string();
    let aggregate = Aggregate::list(list_id);

    let validated_envelope = validate_envelope(&aggregate, "lists/listCreated", request.payload)?;

    let created_by = validated_envelope.payload.get("createdBy").and_then(Value::as_str);
    if created_by != Some(caller_id.0.as_str()) {
        return Err(CreateListError::CreatorMustBeCaller);
    }

    if !ports.membership.claim_ownership(&aggregate, caller_id).await? {
        return Err(CreateListError::AlreadyExists);
    }

    let stored_event = ports
        .events
        .append(
            &aggregate,
            NewEvent {
                event_type: validated_envelope.event_type,
                payload: validated_envelope.payload,
                event_id: request.event_id,
                device_id: request.device_id,
                user_id: caller_id.clone(),
            },
        )
        .await?;

    let _ = ports.broadcast.publish(&aggregate.channel(), &stored_event).await;

    Ok(stored_event)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{MemoryEventPublisher, MemoryEventStore, MemoryMembershipStore};
    use crate::ports::{EventStore, MemberRole, MembershipStore};
    use serde_json::json;

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

    fn create_request(list_id: &str, created_by: &str) -> CreateListRequest {
        CreateListRequest {
            payload: json!({ "listId": list_id, "name": "Wocheneinkauf", "createdBy": created_by }),
            event_id: format!("event-{list_id}"),
            device_id: "device-1".into(),
        }
    }

    #[tokio::test]
    async fn the_creator_becomes_owner_and_the_event_is_stored() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();

        let stored_event = create_list(&wired(&store, &membership, &publisher), &mama(), create_request("abc", "mama"))
            .await
            .expect("create succeeds");

        assert_eq!(stored_event.event_type, "lists/listCreated");
        let role = membership
            .role_of(&Aggregate::list("abc"), &mama())
            .await
            .expect("readable");
        assert_eq!(role, Some(MemberRole::Owner));
    }

    #[tokio::test]
    async fn a_spoofed_creator_is_rejected() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();

        let result = create_list(&wired(&store, &membership, &publisher), &mama(), create_request("abc", "papa")).await;

        assert!(matches!(result, Err(CreateListError::CreatorMustBeCaller)));
        let log = store.events_since(&Aggregate::list("abc"), None).await.expect("readable");
        assert!(log.is_empty());
    }

    #[tokio::test]
    async fn an_existing_list_id_cannot_be_claimed_again() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();

        create_list(&wired(&store, &membership, &publisher), &mama(), create_request("abc", "mama"))
            .await
            .expect("first create succeeds");
        let second = create_list(
            &wired(&store, &membership, &publisher),
            &UserId("papa".into()),
            CreateListRequest {
                payload: json!({ "listId": "abc", "name": "Fremde Liste", "createdBy": "papa" }),
                event_id: "event-2".into(),
                device_id: "device-2".into(),
            },
        )
        .await;

        assert!(matches!(second, Err(CreateListError::AlreadyExists)));
    }

    #[tokio::test]
    async fn an_invalid_payload_is_rejected() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();
        let garbage = CreateListRequest {
            payload: json!({ "listId": "abc" }),
            event_id: "event-1".into(),
            device_id: "device-1".into(),
        };

        let result = create_list(&wired(&store, &membership, &publisher), &mama(), garbage).await;

        assert!(matches!(result, Err(CreateListError::InvalidEnvelope(_))));
    }
}
