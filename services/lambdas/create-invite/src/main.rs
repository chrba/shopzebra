use adapters::{DynamoDbInviteStore, DynamoDbMembershipStore};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::usecases::create_invite::{create_invite, CreateInviteError, CreateInviteRequest};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use lib::aggregate_route::aggregate_from_path;
use lib::error::ApiError;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

// POST /lists/{listId}/invites and POST /recipes/{recipeId}/invites —
// class-2 command: only the owner mints an invite token. Repeated calls hand
// out the active token unchanged, so the link and QR on the invite screen
// stay stable across visits.
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
    let membership = DynamoDbMembershipStore::new(client.clone(), membership_table.clone());
    let invites = DynamoDbInviteStore::new(client, membership_table);

    let membership = &membership;
    let invites = &invites;
    run(service_fn(move |http_request: Request| async move {
        handle(membership, invites, http_request).await
    }))
    .await
}

async fn handle(
    membership: &DynamoDbMembershipStore,
    invites: &DynamoDbInviteStore,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller_id = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let aggregate = match aggregate_from_path(&http_request) {
        Ok(aggregate) => aggregate,
        Err(api_error) => return api_error.to_response(),
    };

    let request = CreateInviteRequest {
        aggregate,
        fresh_token: uuid::Uuid::new_v4().simple().to_string(),
        now_ms: now_ms(),
    };

    match create_invite(membership, invites, &caller_id, request).await {
        Ok(invite) => lib::response::json(
            201,
            &json!({ "token": invite.token, "expiresAt": invite.expires_at_ms }),
        ),
        Err(CreateInviteError::NotAllowed(violation)) => {
            ApiError::Forbidden(violation.to_string()).to_response()
        }
        Err(CreateInviteError::Store(store_error)) => {
            tracing::error!(error = %store_error, "create invite failed");
            ApiError::Internal.to_response()
        }
    }
}

/// Wall clock for the token's expiry. A clock read that fails falls back to
/// the epoch, which mints a token that is already expired — unusable rather
/// than eternally valid, and without risking an overflow when the use case
/// adds the TTL.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
        .unwrap_or(0)
}
