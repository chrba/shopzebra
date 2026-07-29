use adapters::{DynamoDbEventStore, DynamoDbMembershipStore, NoopEventPublisher};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::ports::Ports;
use domain::usecases::my_lists::my_lists;
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use lib::error::ApiError;
use serde_json::json;

// GET /lists — which lists is the caller a member of? Answered from the
// server-owned membership projection. A new device starts here, then
// catches up per list via GET /lists/{id}/events.
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

    match my_lists(ports, &caller).await {
        Ok(aggregates) => {
            let list_ids: Vec<_> = aggregates.into_iter().map(|aggregate| aggregate.id).collect();
            lib::response::json(200, &json!({ "lists": list_ids }))
        }
        Err(store_error) => {
            tracing::error!(error = %store_error, "get lists failed");
            ApiError::Internal.to_response()
        }
    }
}
