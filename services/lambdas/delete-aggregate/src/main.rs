use adapters::{DynamoDbEventStore, DynamoDbMembershipStore, NoopEventPublisher};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::ports::Ports;
use domain::usecases::delete_aggregate::{
    delete_aggregate, DeleteAggregateError, DeleteAggregateRequest,
};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use lib::aggregate_route::aggregate_from_path;
use lib::error::ApiError;
use lib::wire;
use serde_json::json;

// DELETE /lists/{listId} and the recipe route beside it — class-2 command:
// deleting ends every membership, which is the server's projection to write.
// Only the owner may do it. Appending `listDeleted` on the generic path
// instead left the memberships standing, so `GET /lists` kept naming a gone
// list and every sync cycle refetched its whole log.
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

    // Which kind is deleted comes from the route, so lists, recipes and
    // plans share this one lambda (sharing-model.md).
    let aggregate = match aggregate_from_path(&http_request) {
        Ok(aggregate) => aggregate,
        Err(api_error) => return api_error.to_response(),
    };

    // The body carries only the event identity — what is deleted is in the
    // path, and who asks comes from the verified JWT.
    let request = match parse_request(aggregate, http_request.body().as_ref()) {
        Ok(request) => request,
        Err(api_error) => return api_error.to_response(),
    };

    match delete_aggregate(ports, &caller_id, request).await {
        Ok(stored) => lib::response::json(
            200,
            &json!({ "position": stored.position.to_string(), "eventId": stored.event_id }),
        ),
        // Also the answer to a repeated delete: the caller's own membership
        // ended with the first one, so they are no longer a member of what
        // they are asking about.
        Err(DeleteAggregateError::NotAllowed(violation)) => {
            ApiError::Forbidden(violation.to_string()).to_response()
        }
        Err(DeleteAggregateError::Store(store_error)) => {
            tracing::error!(error = %store_error, "delete aggregate failed");
            ApiError::Internal.to_response()
        }
    }
}

fn parse_request(
    aggregate: domain::event::Aggregate,
    body: &[u8],
) -> Result<DeleteAggregateRequest, ApiError> {
    let action = wire::parse_action(body)?;
    Ok(DeleteAggregateRequest {
        aggregate,
        event_id: wire::required_meta_field(&action, "eventId")?,
        device_id: wire::required_meta_field(&action, "deviceId")?,
    })
}
