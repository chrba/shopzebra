use lambda_http::{Body, Error, Response};
use serde::Serialize;

pub fn json(status: u16, body: &impl Serialize) -> Result<Response<Body>, Error> {
    let json = serde_json::to_string(body)?;
    let response = Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::Text(json))?;
    Ok(response)
}
