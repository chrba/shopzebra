use adapters::{DynamoDbEventStore, DynamoDbMembershipStore, NoopEventPublisher};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::usecases::append_event::{append_event, AppendEventError, AppendEventRequest};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use domain::ports::Ports;
use lib::aggregate_route::aggregate_from_path;
use lib::error::ApiError;
use lib::wire;
use serde_json::json;

// POST /lists/{listId}/events and the recipe route beside it — the
// generic class-1 append path: any
// member may send allowlisted, schema-valid events; the server assigns
// the ULID and never interprets the payload.
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

    let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };
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

    let request = match parse_request(http_request.body().as_ref()) {
        Ok(request) => request,
        Err(api_error) => return api_error.to_response(),
    };

    match append_event(ports, &caller_id, &aggregate, request).await {
        Ok(stored) => lib::response::json(
            201,
            &json!({ "position": stored.position.to_string(), "eventId": stored.event_id }),
        ),
        Err(AppendEventError::Forbidden(violation)) => {
            ApiError::Forbidden(violation.to_string()).to_response()
        }
        Err(AppendEventError::InvalidEnvelope(violation)) => {
            ApiError::ValidationFailed(violation.to_string()).to_response()
        }
        Err(AppendEventError::Store(store_error)) => {
            tracing::error!(error = %store_error, "append failed");
            ApiError::Internal.to_response()
        }
    }
}

fn parse_request(body: &[u8]) -> Result<AppendEventRequest, ApiError> {
    let action = wire::parse_action(body)?;
    Ok(AppendEventRequest {
        event_type: wire::required_type(&action)?,
        payload: wire::required_payload(&action)?,
        event_id: wire::required_meta_field(&action, "eventId")?,
        device_id: wire::required_meta_field(&action, "deviceId")?,
    })
}
