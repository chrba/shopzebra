use lambda_http::request::RequestContext;
use lambda_http::{Request, RequestExt};

use crate::error::ApiError;

/// The caller's user id: the Cognito username of the access token. The
/// client mints it as a UUID at first start and signs the shadow account up
/// under it, so every event ever written carries the same author the JWT
/// proves. `sub` would be a second id for the same person.
pub fn extract_user_id(request: &Request) -> Result<String, ApiError> {
    let context = match request.request_context_ref() {
        Some(ctx) => ctx,
        None => return Err(ApiError::Unauthorized),
    };

    match context {
        RequestContext::ApiGatewayV2(ctx) => ctx
            .authorizer
            .as_ref()
            .and_then(|auth| auth.jwt.as_ref())
            .and_then(|jwt| jwt.claims.get("username"))
            .cloned()
            .ok_or(ApiError::Unauthorized),
        _ => Err(ApiError::Unauthorized),
    }
}
