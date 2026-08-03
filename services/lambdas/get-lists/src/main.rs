use adapters::{
    CognitoUserDirectory, DynamoDbEventStore, DynamoDbMembershipStore, NoopEventPublisher,
};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::ports::Ports;
use domain::limits::MAX_LIST_MEMBERS;
use domain::usecases::my_aggregates::aggregates_with_owners;
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use lib::aggregate_route::kind_from_collection;
use lib::error::ApiError;
use serde_json::json;

// GET /lists and GET /recipes — which of them is the caller a member of?
// Answered from the server-owned membership projection. A new device starts
// here, then catches up per aggregate via GET /<collection>/{id}/events.
// One lambda for both: the route names the kind, everything else is shared.
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
    let users = CognitoUserDirectory::new(
        aws_sdk_cognitoidentityprovider::Client::new(&config),
        std::env::var("USER_POOL_ID")?,
    );

    let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };
    let ports = &ports;
    let users = &users;
    run(service_fn(move |http_request: Request| async move {
        handle(ports, users, http_request).await
    }))
    .await
}

async fn handle(
    ports: &Ports<'_>,
    users: &CognitoUserDirectory,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller_id = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let kind = match kind_from_collection(&http_request) {
        Ok(kind) => kind,
        Err(api_error) => return api_error.to_response(),
    };

    match aggregates_with_owners(ports, users, &caller_id, kind).await {
        Ok(summaries) => {
            // The ids travel under the collection's own name (`lists`,
            // `recipes`) — the catch-up reads them as a plain id array.
            let aggregate_ids: Vec<_> =
                summaries.iter().map(|summary| summary.id.clone()).collect();
            let owner_names: serde_json::Map<String, serde_json::Value> = summaries
                .into_iter()
                .filter_map(|summary| summary.owner_name.map(|name| (summary.id, json!(name))))
                .collect();
            // maxMembers travels with the projection so the clients keep no
            // second copy of the number — it lives once, in domain::limits.
            lib::response::json(
                200,
                &json!({
                    kind.collection_name(): aggregate_ids,
                    "ownerNames": owner_names,
                    "maxMembers": MAX_LIST_MEMBERS,
                }),
            )
        }
        Err(store_error) => {
            tracing::error!(error = %store_error, "listing the caller's aggregates failed");
            ApiError::Internal.to_response()
        }
    }
}
