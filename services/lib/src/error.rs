use lambda_http::{Body, Error, Response};
use serde::Serialize;

#[derive(Debug)]
pub enum ApiError {
    Unauthorized,
    BadRequest(String),
    ValidationFailed(String),
    Internal,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}


impl From<ApiError> for  Result<Response<Body>, Error> {
    fn from(value: ApiError) -> Self {
             let (status, message) = match value {
            ApiError::Unauthorized => (401, "Unauthorized".to_string()),
            ApiError::BadRequest(msg) => (400, msg.clone()),
            ApiError::ValidationFailed(msg) => (422, msg.clone()),
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


impl ApiError {
    pub fn to_response(&self) -> Result<Response<Body>, Error> {
        let (status, message) = match self {
            ApiError::Unauthorized => (401, "Unauthorized".to_string()),
            ApiError::BadRequest(msg) => (400, msg.clone()),
            ApiError::ValidationFailed(msg) => (422, msg.clone()),
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
            ApiError::BadRequest(msg) => write!(f, "Bad request: {msg}"),
            ApiError::ValidationFailed(msg) => write!(f, "Validation failed: {msg}"),
            ApiError::Internal => write!(f, "Internal server error"),
        }
    }
}

impl std::error::Error for ApiError {}
