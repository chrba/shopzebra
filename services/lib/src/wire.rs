//! The wire format is the Redux action: `{ type, payload, meta }`.
//! These helpers read its parts and turn absence into a 400.

use serde_json::Value;

use crate::error::ApiError;

pub fn parse_action(body: &[u8]) -> Result<Value, ApiError> {
    serde_json::from_slice(body).map_err(|_| ApiError::BadRequest("body must be JSON".into()))
}

pub fn required_type(action: &Value) -> Result<String, ApiError> {
    action
        .get("type")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| ApiError::BadRequest("type is required".into()))
}

pub fn required_payload(action: &Value) -> Result<Value, ApiError> {
    action
        .get("payload")
        .cloned()
        .ok_or_else(|| ApiError::BadRequest("payload is required".into()))
}

pub fn required_meta_field(action: &Value, field: &str) -> Result<String, ApiError> {
    action
        .get("meta")
        .and_then(|meta| meta.get(field))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| ApiError::BadRequest(format!("meta.{field} is required")))
}
