use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use serde_json::Value;

// Cognito PreSignUp trigger. Auto-confirms every sign-up: a shadow account
// registers without an email address, so Cognito has nowhere to deliver a
// confirmation code to and the user would stay UNCONFIRMED forever.
#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .without_time()
        .init();

    run(service_fn(auto_confirm)).await
}

/// Called by Cognito on every SignUp, before the user is created. Returns
/// the event unchanged apart from the confirmation flag — Cognito reads the
/// whole payload back, so nothing else may be dropped.
async fn auto_confirm(event: LambdaEvent<Value>) -> Result<Value, Error> {
    let (mut payload, _context) = event.into_parts();
    payload["response"]["autoConfirmUser"] = Value::Bool(true);
    Ok(payload)
}
