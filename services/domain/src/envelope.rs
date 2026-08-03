use std::collections::HashMap;
use std::sync::LazyLock;

use jsonschema::Validator;
use serde_json::Value;
use thiserror::Error;

use crate::event::{Aggregate, AggregateKind};

/// Hard cap against storage/fold flooding — the log is append-only and
/// immutable, oversized garbage would live forever.
pub const MAX_PAYLOAD_BYTES: usize = 8 * 1024;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EnvelopeError {
    /// Not in the allowlist. This also rejects every class-2 type
    /// (listMemberAdded etc.) — those are only ever written by the server.
    #[error("unknown event type: {0}")]
    UnknownEventType(String),
    #[error("event type {0} does not belong to this aggregate kind")]
    WrongAggregateKind(String),
    #[error("payload aggregate id does not match the request path")]
    AggregateIdMismatch,
    #[error("payload exceeds {MAX_PAYLOAD_BYTES} bytes")]
    PayloadTooLarge,
    #[error("payload violates schema: {0}")]
    SchemaViolation(String),
}

/// A class-1 event that passed envelope and schema validation.
#[derive(Debug)]
pub struct ValidatedEnvelope {
    pub event_type: String,
    pub payload: Value,
}

struct EventTypeSpec {
    aggregate_kind: AggregateKind,
    /// Payload field that must equal the aggregate id from the path.
    aggregate_id_field: &'static str,
    schema: Validator,
}

fn allow(
    specs: &mut HashMap<&'static str, EventTypeSpec>,
    event_type: &'static str,
    aggregate_kind: AggregateKind,
    aggregate_id_field: &'static str,
    schema_source: &'static str,
) {
    let schema: Value =
        serde_json::from_str(schema_source).expect("embedded schema is valid JSON");
    let validator = jsonschema::validator_for(&schema).expect("embedded schema compiles");
    specs.insert(event_type, EventTypeSpec { aggregate_kind, aggregate_id_field, schema: validator });
}

/// The class-1 allowlist. Schemas are data (services/domain/schemas/) —
/// a new event type is a schema file plus this registration, and the
/// files can later move to a registry without changing the validator.
static ALLOWLIST: LazyLock<HashMap<&'static str, EventTypeSpec>> = LazyLock::new(|| {
    use AggregateKind::{List, Recipe};
    let mut specs = HashMap::new();
    allow(&mut specs, "lists/listCreated", List, "listId", include_str!("../schemas/lists.listCreated.json"));
    allow(&mut specs, "lists/listRenamed", List, "listId", include_str!("../schemas/lists.listRenamed.json"));
    allow(&mut specs, "lists/listDeleted", List, "listId", include_str!("../schemas/lists.listDeleted.json"));
    allow(&mut specs, "lists/messageSent", List, "listId", include_str!("../schemas/lists.messageSent.json"));
    allow(&mut specs, "lists/reactionAdded", List, "listId", include_str!("../schemas/lists.reactionAdded.json"));
    allow(&mut specs, "shopping/itemAdded", List, "listId", include_str!("../schemas/shopping.itemAdded.json"));
    allow(&mut specs, "shopping/itemChecked", List, "listId", include_str!("../schemas/shopping.itemChecked.json"));
    allow(&mut specs, "shopping/itemUnchecked", List, "listId", include_str!("../schemas/shopping.itemUnchecked.json"));
    allow(&mut specs, "shopping/itemRemoved", List, "listId", include_str!("../schemas/shopping.itemRemoved.json"));
    allow(&mut specs, "shopping/itemUpdated", List, "listId", include_str!("../schemas/shopping.itemUpdated.json"));
    allow(&mut specs, "shopping/itemNoteUpdated", List, "listId", include_str!("../schemas/shopping.itemNoteUpdated.json"));
    allow(&mut specs, "shopping/customVariantAdded", List, "listId", include_str!("../schemas/shopping.customVariantAdded.json"));
    allow(&mut specs, "mealPlan/ingredientsCheckedOut", List, "listId", include_str!("../schemas/mealPlan.ingredientsCheckedOut.json"));
    allow(&mut specs, "recipes/recipeCreated", Recipe, "recipeId", include_str!("../schemas/recipes.recipeCreated.json"));
    allow(&mut specs, "recipes/recipeUpdated", Recipe, "recipeId", include_str!("../schemas/recipes.recipeUpdated.json"));
    allow(&mut specs, "recipes/recipeDeleted", Recipe, "recipeId", include_str!("../schemas/recipes.recipeDeleted.json"));
    // Plan aggregate schemas follow with their feature.
    specs
});

/// Validates form, never meaning: allowlist, aggregate match, size cap,
/// JSON schema per event type (sync-engine.md §6).
pub fn validate_envelope(
    aggregate: &Aggregate,
    event_type: &str,
    payload: Value,
) -> Result<ValidatedEnvelope, EnvelopeError> {
    let serialized = serde_json::to_vec(&payload)
        .map_err(|_| EnvelopeError::SchemaViolation("payload is not serializable".into()))?;
    if serialized.len() > MAX_PAYLOAD_BYTES {
        return Err(EnvelopeError::PayloadTooLarge);
    }

    let spec = ALLOWLIST
        .get(event_type)
        .ok_or_else(|| EnvelopeError::UnknownEventType(event_type.to_string()))?;

    if spec.aggregate_kind != aggregate.kind {
        return Err(EnvelopeError::WrongAggregateKind(event_type.to_string()));
    }

    let payload_aggregate_id = payload.get(spec.aggregate_id_field).and_then(Value::as_str);
    if payload_aggregate_id != Some(aggregate.id.as_str()) {
        return Err(EnvelopeError::AggregateIdMismatch);
    }

    if let Err(violation) = spec.schema.validate(&payload) {
        return Err(EnvelopeError::SchemaViolation(violation.to_string()));
    }

    Ok(ValidatedEnvelope { event_type: event_type.to_string(), payload })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn groceries() -> Aggregate {
        Aggregate::list("abc")
    }

    #[test]
    fn accepts_a_well_formed_item_added() {
        let payload = json!({
            "listId": "abc", "itemId": "apples--Elstar", "name": "Elstar",
            "quantity": 2, "unit": "kg", "category": "fruits-vegetables",
            "addedBy": "user-1", "parentId": "apples"
        });

        let validation = validate_envelope(&groceries(), "shopping/itemAdded", payload);

        assert!(validation.is_ok());
    }

    #[test]
    fn rejects_unknown_event_types() {
        let result = validate_envelope(&groceries(), "shopping/evilEvent", json!({ "listId": "abc" }));

        assert_eq!(result.unwrap_err(), EnvelopeError::UnknownEventType("shopping/evilEvent".into()));
    }

    #[test]
    fn rejects_class_2_types_on_the_generic_append_path() {
        let payload = json!({ "listId": "abc", "memberId": "attacker" });

        let result = validate_envelope(&groceries(), "lists/listMemberAdded", payload);

        assert_eq!(
            result.unwrap_err(),
            EnvelopeError::UnknownEventType("lists/listMemberAdded".into())
        );
    }

    #[test]
    fn rejects_a_payload_targeting_another_aggregate() {
        let payload = json!({ "listId": "somebody-elses-list", "name": "Neu" });

        let result = validate_envelope(&groceries(), "lists/listRenamed", payload);

        assert_eq!(result.unwrap_err(), EnvelopeError::AggregateIdMismatch);
    }

    #[test]
    fn rejects_schema_violations() {
        let payload = json!({
            "listId": "abc", "itemId": "apples", "name": "Äpfel",
            "quantity": "drei", "unit": "kg", "category": "fruits-vegetables",
            "addedBy": "user-1"
        });

        let result = validate_envelope(&groceries(), "shopping/itemAdded", payload);

        assert!(matches!(result.unwrap_err(), EnvelopeError::SchemaViolation(_)));
    }

    #[test]
    fn rejects_missing_required_fields() {
        let payload = json!({ "listId": "abc" });

        let result = validate_envelope(&groceries(), "shopping/itemChecked", payload);

        assert!(matches!(result.unwrap_err(), EnvelopeError::SchemaViolation(_)));
    }

    #[test]
    fn rejects_oversized_payloads() {
        let payload = json!({ "listId": "abc", "name": "x".repeat(MAX_PAYLOAD_BYTES) });

        let result = validate_envelope(&groceries(), "lists/listRenamed", payload);

        assert_eq!(result.unwrap_err(), EnvelopeError::PayloadTooLarge);
    }
}

#[cfg(test)]
mod recipe_tests {
    use super::*;
    use serde_json::json;

    fn bolognese() -> Aggregate {
        Aggregate::recipe("bolo")
    }

    fn well_formed() -> serde_json::Value {
        json!({
            "recipeId": "bolo",
            "name": "Spaghetti Bolognese",
            "createdBy": "user-1",
            "portions": 4,
            "durationMinutes": 30,
            "ingredients": [{ "name": "Spaghetti", "quantity": "500", "unit": "g" }],
            "steps": ["Wasser aufsetzen", "Sauce köcheln"]
        })
    }

    #[test]
    fn accepts_a_well_formed_recipe() {
        let result = validate_envelope(&bolognese(), "recipes/recipeCreated", well_formed());

        assert!(result.is_ok());
    }

    #[test]
    fn a_recipe_event_is_rejected_on_a_list_aggregate() {
        let result =
            validate_envelope(&Aggregate::list("abc"), "recipes/recipeCreated", well_formed());

        assert_eq!(
            result.unwrap_err(),
            EnvelopeError::WrongAggregateKind("recipes/recipeCreated".into())
        );
    }

    #[test]
    fn a_recipe_without_a_name_is_rejected() {
        let mut payload = well_formed();
        payload.as_object_mut().expect("object").remove("name");

        let result = validate_envelope(&bolognese(), "recipes/recipeCreated", payload);

        assert!(matches!(result.unwrap_err(), EnvelopeError::SchemaViolation(_)));
    }

    #[test]
    fn a_recipe_without_a_creator_is_rejected() {
        let mut payload = well_formed();
        payload.as_object_mut().expect("object").remove("createdBy");

        let result = validate_envelope(&bolognese(), "recipes/recipeCreated", payload);

        assert!(matches!(result.unwrap_err(), EnvelopeError::SchemaViolation(_)));
    }

    #[test]
    fn a_recipe_may_leave_out_its_duration() {
        let mut payload = well_formed();
        payload
            .as_object_mut()
            .expect("object")
            .remove("durationMinutes");

        let result = validate_envelope(&bolognese(), "recipes/recipeCreated", payload);

        assert!(result.is_ok());
    }

    #[test]
    fn a_payload_naming_another_recipe_is_rejected() {
        let mut payload = well_formed();
        payload.as_object_mut().expect("object")["recipeId"] = json!("somebody-elses-recipe");

        let result = validate_envelope(&bolognese(), "recipes/recipeCreated", payload);

        assert_eq!(result.unwrap_err(), EnvelopeError::AggregateIdMismatch);
    }

    #[test]
    fn the_member_events_of_a_recipe_stay_off_the_generic_path() {
        let payload = json!({ "recipeId": "bolo", "memberId": "attacker", "name": "Eve" });

        let result = validate_envelope(&bolognese(), "recipes/recipeMemberAdded", payload);

        assert_eq!(
            result.unwrap_err(),
            EnvelopeError::UnknownEventType("recipes/recipeMemberAdded".into())
        );
    }
}
