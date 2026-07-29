use lambda_http::{Body, Error, Response};
use serde::Serialize;

#[derive(Debug)]
pub enum ApiError {
    Unauthorized,
    Forbidden(String),
    BadRequest(String),
    ValidationFailed(String),
    Conflict(String),
    Internal,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}


impl ApiError {
    pub fn to_response(&self) -> Result<Response<Body>, Error> {
        let (status, message) = match self {
            ApiError::Unauthorized => (401, "Unauthorized".to_string()),
            ApiError::Forbidden(msg) => (403, msg.clone()),
            ApiError::BadRequest(msg) => (400, msg.clone()),
            ApiError::ValidationFailed(msg) => (422, msg.clone()),
            ApiError::Conflict(msg) => (409, msg.clone()),
            ApiError::Internal => (500, "Internal server error".to_string()),
        };

        let json = serde_json::to_string(&ErrorBody { error: message })?;
        let response = Response::builder()
            .status(status)
            .header("content-type", "application/json")
            .body(Body::Text(json))?;
        Ok(response)
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::Unauthorized => write!(f, "Unauthorized"),
            ApiError::Forbidden(msg) => write!(f, "Forbidden: {msg}"),
            ApiError::BadRequest(msg) => write!(f, "Bad request: {msg}"),
            ApiError::ValidationFailed(msg) => write!(f, "Validation failed: {msg}"),
            ApiError::Conflict(msg) => write!(f, "Conflict: {msg}"),
            ApiError::Internal => write!(f, "Internal server error"),
        }
    }
}

impl std::error::Error for ApiError {}
