use adapters::DynamoDbFriendInviteStore;
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::usecases::friends::{create_friend_invite, FriendError};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use lib::error::ApiError;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

// POST /friends/invites — mints the caller's friendship link. Unlike a list
// invite this belongs to no aggregate; accepting it only writes the address
// book, never a membership.
#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .without_time()
        .init();

    let config = aws_config::load_from_env().await;
    let invites = DynamoDbFriendInviteStore::new(
        Client::new(&config),
        std::env::var("MEMBERSHIP_TABLE")?,
    );

    let invites = &invites;
    run(service_fn(move |http_request: Request| async move {
        handle(invites, http_request).await
    }))
    .await
}

async fn handle(
    invites: &DynamoDbFriendInviteStore,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let token = uuid::Uuid::new_v4().simple().to_string();
    match create_friend_invite(invites, &caller, token, now_ms()).await {
        Ok(invite) => lib::response::json(
            201,
            &json!({ "token": invite.token, "expiresAt": invite.expires_at_ms }),
        ),
        Err(FriendError::Store(store_error)) => {
            tracing::error!(error = %store_error, "create friend invite failed");
            ApiError::Internal.to_response()
        }
        Err(other) => ApiError::BadRequest(other.to_string()).to_response(),
    }
}

/// A failed clock read falls back to the epoch: the token is then already
/// expired — unusable rather than eternally valid, and no overflow when the
/// use case adds the TTL.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
        .unwrap_or(0)
}
