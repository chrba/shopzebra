use adapters::{DynamoDbFriendInviteStore, DynamoDbFriendStore};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::usecases::friends::{accept_friend_invite, FriendError};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use lib::error::ApiError;
use lib::wire;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

// POST /friends/join — redeems a friendship link. Writes BOTH directions:
// the two are now in each other's address book. Removing later deletes only
// the remover's own side.
#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .without_time()
        .init();

    let config = aws_config::load_from_env().await;
    let client = Client::new(&config);
    let membership_table = std::env::var("MEMBERSHIP_TABLE")?;
    let invites = DynamoDbFriendInviteStore::new(client.clone(), membership_table.clone());
    let friends = DynamoDbFriendStore::new(client, membership_table);

    let invites = &invites;
    let friends = &friends;
    run(service_fn(move |http_request: Request| async move {
        handle(invites, friends, http_request).await
    }))
    .await
}

async fn handle(
    invites: &DynamoDbFriendInviteStore,
    friends: &DynamoDbFriendStore,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller_id = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let token = match parse_token(http_request.body().as_ref()) {
        Ok(token) => token,
        Err(api_error) => return api_error.to_response(),
    };

    match accept_friend_invite(invites, friends, &caller_id, &token, now_ms()).await {
        Ok(inviter) => lib::response::json(200, &json!({ "friendId": inviter.0 })),
        Err(FriendError::InvalidToken) => {
            ApiError::BadRequest("invalid or expired friend invite token".into()).to_response()
        }
        Err(FriendError::OwnInvite) => {
            ApiError::BadRequest("you cannot accept your own invite".into()).to_response()
        }
        Err(FriendError::Store(store_error)) => {
            tracing::error!(error = %store_error, "accept friend invite failed");
            ApiError::Internal.to_response()
        }
    }
}

fn parse_token(body: &[u8]) -> Result<String, ApiError> {
    let action = wire::parse_action(body)?;
    let payload = wire::required_payload(&action)?;
    Ok(payload
        .get("token")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("payload.token is required".into()))?
        .to_string())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
        .unwrap_or(0)
}
