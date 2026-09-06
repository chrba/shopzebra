use lambda_http::{Body, Error, Response};
use serde::Serialize;

#[derive(Debug)]
pub enum ApiError {
    Unauthorized,
    Forbidden(String),
    /// The addressed resource is not there. Distinct from `BadRequest`: the
    /// request was well formed, it just names something that does not exist —
    /// a membership that has already ended, for instance. Clients read this
    /// as "already gone", which is a success for anything that deletes.
    NotFound(String),
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
            ApiError::NotFound(msg) => (404, msg.clone()),
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
            ApiError::NotFound(msg) => write!(f, "Not found: {msg}"),
            ApiError::BadRequest(msg) => write!(f, "Bad request: {msg}"),
            ApiError::ValidationFailed(msg) => write!(f, "Validation failed: {msg}"),
            ApiError::Conflict(msg) => write!(f, "Conflict: {msg}"),
            ApiError::Internal => write!(f, "Internal server error"),
        }
    }
}

impl std::error::Error for ApiError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn status_of(api_error: ApiError) -> u16 {
        api_error.to_response().expect("renders").status().as_u16()
    }

    #[test]
    fn a_missing_resource_is_404_not_400() {
        // "your request was malformed" and "what you named is not there"
        // are different answers; only the second lets a client treat the
        // situation as already-done.
        assert_eq!(status_of(ApiError::NotFound("gone".into())), 404);
        assert_eq!(status_of(ApiError::BadRequest("garbage".into())), 400);
    }

    #[test]
    fn every_variant_keeps_its_status() {
        assert_eq!(status_of(ApiError::Unauthorized), 401);
        assert_eq!(status_of(ApiError::Forbidden("no".into())), 403);
        assert_eq!(status_of(ApiError::ValidationFailed("nope".into())), 422);
        assert_eq!(status_of(ApiError::Conflict("taken".into())), 409);
        assert_eq!(status_of(ApiError::Internal), 500);
    }
}
