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

/// Server-assigned position in the aggregate log. The canonical event
/// order (conflict-resolution.md §3): per aggregate strictly monotonic
/// and gap-free — a client holding positions 41 and 43 knows 42 is
/// missing. Zero-padded in storage and on the wire so lexicographic
/// order equals numeric order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Position(pub u64);

impl Position {
    pub fn first() -> Self {
        Position(1)
    }

    pub fn next(&self) -> Self {
        Position(self.0 + 1)
    }
}

impl std::fmt::Display for Position {
    /// Zero-padded to 20 digits — the full u64 range — so string
    /// comparison (DynamoDB sort key, sync cursor) equals numeric order.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:020}", self.0)
    }
}

impl std::str::FromStr for Position {
    type Err = std::num::ParseIntError;

    fn from_str(padded: &str) -> Result<Self, Self::Err> {
        padded.parse::<u64>().map(Position)
    }
}

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
    pub position: Position,
    pub event_type: String,
    pub payload: Value,
    pub event_id: String,
    pub device_id: String,
    pub user_id: UserId,
}

impl StoredEvent {
    /// The wire format is the Redux action the client dispatched,
    /// plus the server-assigned meta. The client folds these directly
    /// (sync-engine.md §3) — no mapping layer.
    pub fn to_wire(&self) -> Value {
        serde_json::json!({
            "type": self.event_type,
            "payload": self.payload,
            "meta": {
                "eventId": self.event_id,
                "deviceId": self.device_id,
                "userId": self.user_id.0,
                "position": self.position.to_string(),
            },
        })
    }
}
