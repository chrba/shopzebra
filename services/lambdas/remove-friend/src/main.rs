use adapters::DynamoDbFriendStore;
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::usecases::friends::remove_friend;
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use lib::error::ApiError;

// DELETE /friends/{friendId} — removes only the caller's own direction. An
// address book is personal: the other side keeps theirs. Shared lists are
// untouched; dropping somebody here never revokes access.
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

    let friends = &friends;
    run(service_fn(move |http_request: Request| async move {
        handle(friends, http_request).await
    }))
    .await
}

async fn handle(
    friends: &DynamoDbFriendStore,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller_id = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };

    let Some(friend_id) = http_request
        .path_parameters()
        .first("friendId")
        .map(String::from)
    else {
        return ApiError::BadRequest("friendId is required".into()).to_response();
    };

    match remove_friend(friends, &caller_id, &UserId(friend_id)).await {
        Ok(()) => lib::response::json(200, &serde_json::json!({})),
        Err(store_error) => {
            tracing::error!(error = %store_error, "remove friend failed");
            ApiError::Internal.to_response()
        }
    }
}
