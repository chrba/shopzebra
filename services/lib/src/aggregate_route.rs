use domain::event::{Aggregate, AggregateKind};
use lambda_http::{Request, RequestExt};

use crate::error::ApiError;

/// How each aggregate kind names itself in a route: `/lists/{listId}/…`,
/// `/recipes/{recipeId}/…`, `/plans/{planId}/…`. The order is the lookup
/// order and does not matter — a route declares exactly one of them.
const ROUTE_PARAMETERS: [(AggregateKind, &str); 3] = [
    (AggregateKind::List, "listId"),
    (AggregateKind::Recipe, "recipeId"),
    (AggregateKind::Plan, "planId"),
];

/// Which kind a collection route addresses: `GET /lists` vs `GET /recipes`.
/// These carry no id, so the leading path segment is the only thing naming
/// the kind.
pub fn kind_from_collection(http_request: &Request) -> Result<AggregateKind, ApiError> {
    let path = http_request.uri().path();
    let collection = path.trim_start_matches('/').split('/').next().unwrap_or("");
    AggregateKind::from_collection_name(collection)
        .ok_or_else(|| ApiError::BadRequest(format!("unknown collection: {path}")))
}

/// Which aggregate a request addresses. Sharing and the event log are one
/// mechanism for lists, recipes and plans (sharing-model.md), so one lambda
/// serves all their routes — the path parameter is what tells them apart.
pub fn aggregate_from_path(http_request: &Request) -> Result<Aggregate, ApiError> {
    let parameters = http_request.path_parameters();
    ROUTE_PARAMETERS
        .iter()
        .find_map(|(kind, parameter)| {
            parameters.first(parameter).map(|id| Aggregate {
                kind: *kind,
                id: id.to_string(),
            })
        })
        .ok_or_else(|| ApiError::BadRequest("no aggregate id in the route".into()))
}
