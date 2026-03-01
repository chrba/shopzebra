use lambda_http::{service_fn, Body, Error, Request, Response};
use std::future::Future;

pub fn start<F, Fut>(handler: F)
where
    F: Fn(Request) -> Fut + Send + Sync + 'static + Copy,
    Fut: Future<Output = Result<Response<Body>, Error>> + Send,
{
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("failed to create tokio runtime")
        .block_on(async {
            tracing_subscriber::fmt()
                .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
                .json()
                .without_time()
                .init();

            lambda_http::run(service_fn(handler))
                .await
                .expect("failed to run lambda");
        });
}
