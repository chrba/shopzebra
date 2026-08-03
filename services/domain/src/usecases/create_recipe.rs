use serde_json::Value;
use thiserror::Error;

use crate::envelope::{validate_envelope, EnvelopeError};
use crate::event::{Aggregate, NewEvent, StoredEvent, UserId};
use crate::ports::{Ports, StoreError};

#[derive(Debug, Error)]
pub enum CreateRecipeError {
    #[error(transparent)]
    InvalidEnvelope(#[from] EnvelopeError),
    /// The creator becomes the owner — a payload claiming somebody else
    /// created the recipe is attribution spoofing.
    #[error("createdBy must be the authenticated caller")]
    CreatorMustBeCaller,
    #[error("a recipe with this id already exists")]
    AlreadyExists,
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct CreateRecipeRequest {
    pub payload: Value,
    pub event_id: String,
    pub device_id: String,
}

/// Class 2: `recipeCreated` bootstraps the authorization root of a recipe —
/// the server claims ownership for the caller atomically, then writes the
/// event itself (POST /recipes, not the generic append path). Same shape as
/// `create_list`: a recipe is owned and shared exactly like a list
/// (sharing-model.md).
pub async fn create_recipe(
    ports: &Ports<'_>,
    caller_id: &UserId,
    request: CreateRecipeRequest,
) -> Result<StoredEvent, CreateRecipeError> {
    let recipe_id = request
        .payload
        .get("recipeId")
        .and_then(Value::as_str)
        .ok_or_else(|| EnvelopeError::SchemaViolation("recipeId is required".into()))?
        .to_string();
    let aggregate = Aggregate::recipe(recipe_id);

    let validated_envelope = validate_envelope(&aggregate, "recipes/recipeCreated", request.payload)?;

    let created_by = validated_envelope.payload.get("createdBy").and_then(Value::as_str);
    if created_by != Some(caller_id.0.as_str()) {
        return Err(CreateRecipeError::CreatorMustBeCaller);
    }

    if !ports.membership.claim_ownership(&aggregate, caller_id).await? {
        return Err(CreateRecipeError::AlreadyExists);
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

    fn create_request(recipe_id: &str, created_by: &str) -> CreateRecipeRequest {
        CreateRecipeRequest {
            payload: json!({
                "recipeId": recipe_id,
                "name": "Spaghetti Bolognese",
                "createdBy": created_by,
                "portions": 4,
                "ingredients": [{ "name": "Spaghetti", "quantity": "500", "unit": "g" }],
                "steps": ["Wasser aufsetzen"]
            }),
            event_id: format!("event-{recipe_id}"),
            device_id: "device-1".into(),
        }
    }

    #[tokio::test]
    async fn the_creator_becomes_owner_and_can_share_the_recipe_afterwards() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();

        let stored_event = create_recipe(
            &wired(&store, &membership, &publisher),
            &mama(),
            create_request("bolo", "mama"),
        )
        .await
        .expect("create succeeds");

        assert_eq!(stored_event.event_type, "recipes/recipeCreated");
        let role = membership
            .role_of(&Aggregate::recipe("bolo"), &mama())
            .await
            .expect("readable");
        assert_eq!(role, Some(MemberRole::Owner));
    }

    #[tokio::test]
    async fn a_spoofed_creator_is_rejected() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();

        let result = create_recipe(
            &wired(&store, &membership, &publisher),
            &mama(),
            create_request("bolo", "papa"),
        )
        .await;

        assert!(matches!(result, Err(CreateRecipeError::CreatorMustBeCaller)));
        let log = store
            .events_since(&Aggregate::recipe("bolo"), None)
            .await
            .expect("readable");
        assert!(log.is_empty());
    }

    #[tokio::test]
    async fn an_existing_recipe_id_cannot_be_claimed_again() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();

        create_recipe(
            &wired(&store, &membership, &publisher),
            &mama(),
            create_request("bolo", "mama"),
        )
        .await
        .expect("first create succeeds");

        let second = create_recipe(
            &wired(&store, &membership, &publisher),
            &UserId("papa".into()),
            create_request("bolo", "papa"),
        )
        .await;

        assert!(matches!(second, Err(CreateRecipeError::AlreadyExists)));
    }

    #[tokio::test]
    async fn a_recipe_and_a_list_may_share_an_id_without_colliding() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();
        membership
            .claim_ownership(&Aggregate::list("same"), &mama())
            .await
            .expect("claims");

        let stored_event = create_recipe(
            &wired(&store, &membership, &publisher),
            &mama(),
            create_request("same", "mama"),
        )
        .await
        .expect("a recipe is a different aggregate than a list of the same id");

        assert_eq!(stored_event.event_type, "recipes/recipeCreated");
    }

    #[tokio::test]
    async fn an_invalid_payload_is_rejected() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();
        let garbage = CreateRecipeRequest {
            payload: json!({ "recipeId": "bolo" }),
            event_id: "event-1".into(),
            device_id: "device-1".into(),
        };

        let result = create_recipe(&wired(&store, &membership, &publisher), &mama(), garbage).await;

        assert!(matches!(result, Err(CreateRecipeError::InvalidEnvelope(_))));
    }
}
