use adapters::{DynamoDbEventStore, DynamoDbMembershipStore, NoopEventPublisher};
use aws_sdk_dynamodb::Client;
use domain::event::{Position, UserId};
use domain::ports::Ports;
use domain::usecases::get_events::{get_events, GetEventsError};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use lib::aggregate_route::aggregate_from_path;
use lib::error::ApiError;
use serde_json::json;

// GET /<collection>/{id}/events?since=<position> — the cursor catch-up,
// for every aggregate kind:
// any member reads everything after the position it already holds.
// Without ?since the whole log is returned (bootstrap of a new device).
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

    let aggregate = match aggregate_from_path(&http_request) {
        Ok(aggregate) => aggregate,
        Err(api_error) => return api_error.to_response(),
    };

    let after = match parse_since(&http_request) {
        Ok(after) => after,
        Err(api_error) => return api_error.to_response(),
    };

    match get_events(ports, &caller, &aggregate, after).await {
        Ok(events) => {
            let wire_events: Vec<_> = events.iter().map(|event| event.to_wire()).collect();
            lib::response::json(200, &json!({ "events": wire_events }))
        }
        Err(GetEventsError::Forbidden(violation)) => {
            ApiError::Forbidden(violation.to_string()).to_response()
        }
        Err(GetEventsError::Store(store_error)) => {
            tracing::error!(error = %store_error, "get events failed");
            ApiError::Internal.to_response()
        }
    }
}

fn parse_since(http_request: &Request) -> Result<Option<Position>, ApiError> {
    let Some(since) = http_request.query_string_parameters().first("since").map(str::to_string)
    else {
        return Ok(None);
    };
    since
        .parse::<Position>()
        .map(Some)
        .map_err(|_| ApiError::BadRequest("since must be a position number".into()))
}
