mod hello;

use lambda_http::{Body, Error, Request, Response};
use lib::error::ApiError;
use serde::{Deserialize, Serialize};
use validator::Validate;

// --- API types ---

#[derive(Deserialize, Validate)]
struct HelloRequest {
    #[validate(length(min = 1, max = 50))]
    name: String,
}

#[derive(Serialize)]
struct HelloResponse {
    message: String,
    user_id: String,
}

// --- Domain → API error mapping ---

impl From<hello::HelloError> for ApiError {
    fn from(err: hello::HelloError) -> Self {
        match err {
            hello::HelloError::NameEmpty => {
                ApiError::ValidationFailed("name must not be empty".into())
            }
        }
    }
}

// --- Handler ---

async fn handler(event: Request) -> Result<Response<Body>, Error> {
    match handle(event).await {
        Ok(response) => Ok(response),
        Err(err) => err.into(),
    }
}

async fn handle(event: Request) -> Result<Response<Body>, ApiError> {
    let user_id = lib::auth::extract_user_id(&event)?;

    let request: HelloRequest = serde_json::from_slice(event.body().as_ref())
        .map_err(|err| ApiError::BadRequest(format!("Invalid request body: {err}")))?;

    request
        .validate()
        .map_err(|errors| ApiError::ValidationFailed(format!("{errors}")))?;

    let greeting = hello::Greeting::new(&request.name)?;

    lib::response::json(
        200,
        &HelloResponse {
            message: greeting.message,
            user_id,
        },
    )
    .map_err(|_| ApiError::Internal)
}

fn main() {
    lib::runtime::start(handler);
}
