use adapters::{CognitoUserDirectory, DynamoDbFriendStore};
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::usecases::friends::my_friends;
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use lib::error::ApiError;
use serde_json::json;

// GET /friends — the caller's address book with display names. Friendships
// live outside the event log, so clients fetch them instead of syncing them.
#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .without_time()
        .init();

    let config = aws_config::load_from_env().await;
    let friends = DynamoDbFriendStore::new(
        Client::new(&config),
        std::env::var("MEMBERSHIP_TABLE")?,
    );
    let users = CognitoUserDirectory::new(
        aws_sdk_cognitoidentityprovider::Client::new(&config),
        std::env::var("USER_POOL_ID")?,
    );

    let friends = &friends;
    let users = &users;
    run(service_fn(move |http_request: Request| async move {
        handle(friends, users, http_request).await
    }))
    .await
}

async fn handle(
    friends: &DynamoDbFriendStore,
    users: &CognitoUserDirectory,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller_id = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    match my_friends(friends, users, &caller_id).await {
        Ok(entries) => {
            // Each entry is a Friend — id plus display name, not just an id.
            let friends: Vec<_> = entries
                .into_iter()
                .map(|friend| json!({ "id": friend.id, "name": friend.name }))
                .collect();
            lib::response::json(200, &json!({ "friends": friends }))
        }
        Err(store_error) => {
            tracing::error!(error = %store_error, "get friends failed");
            ApiError::Internal.to_response()
        }
    }
}
