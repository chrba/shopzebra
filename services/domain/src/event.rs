use serde_json::Value;

/// Which aggregate family a log belongs to. Determines the partition key
/// prefix and the AppSync channel namespace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AggregateKind {
    List,
    Recipe,
    Plan,
}

/// Identity of one aggregate log (one DynamoDB partition).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AggregateId {
    pub kind: AggregateKind,
    pub id: String,
}

impl AggregateId {
    pub fn list(id: impl Into<String>) -> Self {
        Self { kind: AggregateKind::List, id: id.into() }
    }

    pub fn partition_key(&self) -> String {
        match self.kind {
            AggregateKind::List => format!("LIST#{}", self.id),
            AggregateKind::Recipe => format!("RECIPE#{}", self.id),
            AggregateKind::Plan => format!("PLAN#{}", self.id),
        }
    }

    /// AppSync channel this aggregate broadcasts on.
    pub fn channel(&self) -> String {
        match self.kind {
            AggregateKind::List => format!("lists/{}", self.id),
            AggregateKind::Recipe => format!("recipes/{}", self.id),
            AggregateKind::Plan => format!("plans/{}", self.id),
        }
    }
}

/// The authenticated caller, extracted from the verified JWT — never
/// from the request body.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserId(pub String);

/// Server-assigned sort key. Lexicographic order is the canonical event
/// order (conflict-resolution.md §3); per aggregate strictly monotonic.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Ulid(pub String);

/// A validated event ready to be appended. `event_id` comes from the
/// client (idempotency); `user_id` from the JWT.
#[derive(Debug, Clone)]
pub struct NewEvent {
    pub event_type: String,
    pub payload: Value,
    pub event_id: String,
    pub device_id: String,
    pub user_id: UserId,
}

/// An event in the canonical log, with its server-assigned position.
#[derive(Debug, Clone)]
pub struct StoredEvent {
    pub ulid: Ulid,
    pub event_type: String,
    pub payload: Value,
    pub event_id: String,
    pub device_id: String,
    pub user_id: UserId,
}
