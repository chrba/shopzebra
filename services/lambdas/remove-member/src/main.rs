use adapters::{DynamoDbEventStore, DynamoDbMembershipStore, NoopEventPublisher};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::ports::Ports;
use domain::usecases::remove_member::{remove_member, RemoveMemberError, RemoveMemberRequest};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use lib::aggregate_route::aggregate_from_path;
use lib::error::ApiError;
use lib::wire;

// DELETE /lists/{listId}/members/{memberId} and the recipe route beside it —
// class-2 command: the server owns the membership projection. The owner
// removes anyone, a member only themselves; the server writes the
// member-removed event of that aggregate kind itself.
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
    let membership = DynamoDbMembershipStore::new(client, std::env::var("MEMBERSHIP_TABLE")?);
    let publisher = NoopEventPublisher;

    let ports = Ports {
        events: &store,
        membership: &membership,
        broadcast: &publisher,
    };
    let ports = &ports;
    run(service_fn(move |http_request: Request| async move {
        handle(ports, http_request).await
    }))
    .await
}

async fn handle(ports: &Ports<'_>, http_request: Request) -> Result<Response<Body>, Error> {
    let caller_id = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let aggregate = match aggregate_from_path(&http_request) {
        Ok(aggregate) => aggregate,
        Err(api_error) => return api_error.to_response(),
    };
    // Kept before the request takes ownership of the aggregate: the answer
    // names the kind the caller addressed, so the recipe route stops
    // talking about lists.
    let aggregate_kind = aggregate.kind;
    let Some(member_id) = http_request
        .path_parameters()
        .first("memberId")
        .map(String::from)
    else {
        return ApiError::BadRequest("memberId is required".into()).to_response();
    };

    // The body carries only the event identity — who is removed is in the
    // path, and who asks comes from the verified JWT.
    let action = match wire::parse_action(http_request.body().as_ref()) {
        Ok(action) => action,
        Err(api_error) => return api_error.to_response(),
    };
    let request = match (
        wire::required_meta_field(&action, "eventId"),
        wire::required_meta_field(&action, "deviceId"),
    ) {
        (Ok(event_id), Ok(device_id)) => RemoveMemberRequest {
            aggregate,
            member_id: UserId(member_id),
            event_id,
            device_id,
        },
        (Err(api_error), _) | (_, Err(api_error)) => return api_error.to_response(),
    };

    match remove_member(ports, &caller_id, request).await {
        // 200 with an empty object rather than 204: the shared response
        // helper always writes a body, and a 204 carrying one is malformed.
        Ok(()) => lib::response::json(200, &serde_json::json!({})),
        Err(RemoveMemberError::NotAllowed(violation)) => {
            ApiError::Forbidden(violation.to_string()).to_response()
        }
        // 404, not 400: the request was fine, the membership it addresses
        // simply is not there. A client asking to leave something it already
        // left must be able to read that as "already gone".
        Err(RemoveMemberError::NotAMember) => ApiError::NotFound(format!(
            "the target is not a member of this {}",
            aggregate_kind.wire_name()
        ))
        .to_response(),
        Err(RemoveMemberError::Store(store_error)) => {
            tracing::error!(error = %store_error, "remove member failed");
            ApiError::Internal.to_response()
        }
    }
}
