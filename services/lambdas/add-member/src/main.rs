use adapters::{
    CognitoUserDirectory, DynamoDbEventStore, DynamoDbFriendStore, DynamoDbMembershipStore,
    NoopEventPublisher,
};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::ports::Ports;
use domain::usecases::add_member::{add_member, AddMemberError, AddMemberRequest};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use lib::error::ApiError;
use lib::wire;

// POST /lists/{listId}/members — class-2 command: the owner adds somebody
// they already share a list with, skipping the invite token. Everyone else
// still goes through POST /lists/join.
#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .without_time()
        .init();

    let config = aws_config::load_from_env().await;
    let client = Client::new(&config);
    let store = DynamoDbEventStore::new(client.clone(), std::env::var("EVENTS_TABLE")?);
    let membership_table = std::env::var("MEMBERSHIP_TABLE")?;
    let membership = DynamoDbMembershipStore::new(client.clone(), membership_table.clone());
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
    let users = &users;
    let friends = &friends;
    run(service_fn(move |http_request: Request| async move {
        handle(ports, users, friends, http_request).await
    }))
    .await
}

async fn handle(
    ports: &Ports<'_>,
    users: &CognitoUserDirectory,
    friends: &DynamoDbFriendStore,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let Some(list_id) = http_request
        .path_parameters()
        .first("listId")
        .map(String::from)
    else {
        return ApiError::BadRequest("listId is required".into()).to_response();
    };

    let request = match parse_request(list_id, http_request.body().as_ref()) {
        Ok(request) => request,
        Err(api_error) => return api_error.to_response(),
    };

    match add_member(ports, users, friends, &caller, request).await {
        Ok(()) => lib::response::json(200, &serde_json::json!({})),
        Err(AddMemberError::NotAllowed(violation)) => {
            ApiError::Forbidden(violation.to_string()).to_response()
        }
        Err(AddMemberError::NotAFriend) => ApiError::Forbidden(
            "you can only add people from your address book".into(),
        )
        .to_response(),
        Err(AddMemberError::ListFull) => {
            ApiError::Conflict("this list is full".into()).to_response()
        }
        Err(AddMemberError::Store(store_error)) => {
            tracing::error!(error = %store_error, "add member failed");
            ApiError::Internal.to_response()
        }
    }
}

fn parse_request(list_id: String, body: &[u8]) -> Result<AddMemberRequest, ApiError> {
    let action = wire::parse_action(body)?;
    let payload = wire::required_payload(&action)?;
    let member_id = payload
        .get("memberId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("payload.memberId is required".into()))?
        .to_string();

    Ok(AddMemberRequest {
        list_id,
        member_id: UserId(member_id),
        event_id: wire::required_meta_field(&action, "eventId")?,
        device_id: wire::required_meta_field(&action, "deviceId")?,
    })
}
