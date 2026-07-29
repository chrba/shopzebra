use adapters::{DynamoDbEventStore, DynamoDbMembershipStore, NoopEventPublisher};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::usecases::create_list::{create_list, CreateListError, CreateListRequest};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use domain::ports::Ports;
use lib::error::ApiError;
use lib::wire;
use serde_json::json;

// POST /lists — class-2 command: listCreated bootstraps the authorization
// root, the server claims ownership for the caller and writes the event.
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
    let caller = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let request = match parse_request(http_request.body().as_ref()) {
        Ok(request) => request,
        Err(api_error) => return api_error.to_response(),
    };

    match create_list(ports, &caller, request).await {
        Ok(stored) => lib::response::json(
            201,
            &json!({ "position": stored.position.to_string(), "eventId": stored.event_id }),
        ),
        Err(CreateListError::InvalidEnvelope(violation)) => {
            ApiError::ValidationFailed(violation.to_string()).to_response()
        }
        Err(CreateListError::CreatorMustBeCaller) => {
            ApiError::Forbidden("createdBy must be the authenticated caller".into()).to_response()
        }
        Err(CreateListError::AlreadyExists) => {
            ApiError::Conflict("a list with this id already exists".into()).to_response()
        }
        Err(CreateListError::Store(store_error)) => {
            tracing::error!(error = %store_error, "create list failed");
            ApiError::Internal.to_response()
        }
    }
}

fn parse_request(body: &[u8]) -> Result<CreateListRequest, ApiError> {
    let action = wire::parse_action(body)?;
    Ok(CreateListRequest {
        payload: wire::required_payload(&action)?,
        event_id: wire::required_meta_field(&action, "eventId")?,
        device_id: wire::required_meta_field(&action, "deviceId")?,
    })
}
