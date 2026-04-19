use lambda_runtime::{ run, Error, service_fn, LambdaEvent };
use aws_sdk_dynamodb::Client;

mod handler;

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .json()
        .init();

    let config = aws_config::load_from_env().await;
    let client = Client::new(&config);
    run(service_fn(async |event| {
        handler::handle(event, &client).await
    })).await
}