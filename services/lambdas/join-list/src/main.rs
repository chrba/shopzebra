use adapters::{
    CognitoUserDirectory, DynamoDbEventStore, DynamoDbFriendStore, DynamoDbInviteStore,
    DynamoDbMembershipStore, NoopEventPublisher,
};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::ports::Ports;
use domain::usecases::join_list::{join_list, JoinListError, JoinListRequest};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use lib::error::ApiError;
use lib::wire;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

// POST /lists/join — class-2 command: the server verifies the invite token,
// enriches the joiner's display name from Cognito and writes
// lists/listMemberAdded itself. Clients cannot append that type.
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
    let store = DynamoDbEventStore::new(client.clone(), std::env::var("EVENTS_TABLE")?);
    let membership = DynamoDbMembershipStore::new(client.clone(), membership_table.clone());
    let invites = DynamoDbInviteStore::new(client.clone(), membership_table.clone());
    let friends = DynamoDbFriendStore::new(client, membership_table);
    let users = CognitoUserDirectory::new(
        aws_sdk_cognitoidentityprovider::Client::new(&config),
        std::env::var("USER_POOL_ID")?,
    );
    let publisher = NoopEventPublisher;

    let ports = Ports {
        events: &store,
        membership: &membership,
        broadcast: &publisher,
    };
    let ports = &ports;
    let invites = &invites;
    let users = &users;
    let friends = &friends;
    run(service_fn(move |http_request: Request| async move {
        handle(ports, invites, users, friends, http_request).await
    }))
    .await
}

async fn handle(
    ports: &Ports<'_>,
    invites: &DynamoDbInviteStore,
    users: &CognitoUserDirectory,
    friends: &DynamoDbFriendStore,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let request = match parse_request(http_request.body().as_ref()) {
        Ok(request) => request,
        Err(api_error) => return api_error.to_response(),
    };

    match join_list(ports, invites, users, friends, &caller, request).await {
        // An already-joined caller gets the same 200: the join is
        // idempotent, and the client only needs to know where to navigate.
        Ok(joined) => lib::response::json(200, &json!({ "listId": joined.list_id })),
        Err(JoinListError::ListFull) => {
            ApiError::Conflict("this list is full".into()).to_response()
        }
        Err(JoinListError::InvalidToken) => {
            ApiError::BadRequest("invalid or expired invite token".into()).to_response()
        }
        Err(JoinListError::Store(store_error)) => {
            tracing::error!(error = %store_error, "join list failed");
            ApiError::Internal.to_response()
        }
    }
}

fn parse_request(body: &[u8]) -> Result<JoinListRequest, ApiError> {
    let action = wire::parse_action(body)?;
    let payload = wire::required_payload(&action)?;
    let token = payload
        .get("token")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("payload.token is required".into()))?
        .to_string();

    Ok(JoinListRequest {
        token,
        event_id: wire::required_meta_field(&action, "eventId")?,
        device_id: wire::required_meta_field(&action, "deviceId")?,
        now_ms: now_ms(),
    })
}

/// Wall clock for the expiry check. A failed read falls back to the epoch,
/// which makes every token look unexpired — deliberate: the alternative
/// would reject valid invites because our clock misbehaved, and the token
/// itself is still verified against the store.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
        .unwrap_or(0)
}
