use lambda_http::request::RequestContext;
use lambda_http::{Request, RequestExt};

use crate::error::ApiError;

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
            .and_then(|jwt| jwt.claims.get("sub"))
            .cloned()
            .ok_or(ApiError::Unauthorized),
        _ => Err(ApiError::Unauthorized),
    }
}
