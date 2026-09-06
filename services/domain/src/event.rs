use serde_json::Value;

/// Which aggregate family a log belongs to. Determines the partition key
/// prefix and the AppSync channel namespace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AggregateKind {
    List,
    Recipe,
    Plan,
}

impl AggregateKind {
    /// Every kind there is. Iterating this is how code stays exhaustive
    /// without repeating the list.
    pub const ALL: [AggregateKind; 3] = [
        AggregateKind::List,
        AggregateKind::Recipe,
        AggregateKind::Plan,
    ];

    /// How this kind travels on the wire. The client uses the same word, so
    /// an aggregate is named identically on both sides of the language
    /// boundary.
    pub fn wire_name(&self) -> &'static str {
        match self {
            AggregateKind::List => "list",
            AggregateKind::Recipe => "recipe",
            AggregateKind::Plan => "plan",
        }
    }

    /// Plural name of this kind — its route (`/recipes`) and the key its
    /// collection travels under (`{ "recipes": [...] }`).
    pub fn collection_name(&self) -> &'static str {
        match self {
            AggregateKind::List => "lists",
            AggregateKind::Recipe => "recipes",
            AggregateKind::Plan => "plans",
        }
    }

    /// Inverse of `collection_name` — how a route segment names a kind.
    pub fn from_collection_name(collection: &str) -> Option<Self> {
        AggregateKind::ALL
            .into_iter()
            .find(|kind| kind.collection_name() == collection)
    }

    /// Prefix this kind claims in the event store's partition keys.
    fn partition_prefix(&self) -> &'static str {
        match self {
            AggregateKind::List => "LIST#",
            AggregateKind::Recipe => "RECIPE#",
            AggregateKind::Plan => "PLAN#",
        }
    }
}

/// Which aggregate a request addresses: its kind plus its id — together
/// one event log, one DynamoDB partition. The server never materializes an
/// aggregate's state, so this pair is the only form it ever takes here.
///
/// The client names the same pair the same way (`app/sync/aggregate.ts`),
/// and so does the wire. `id` alone is what the payloads call `listId` /
/// `recipeId`; a bare id string is therefore an `aggregate_id`, this pair
/// is an `aggregate`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Aggregate {
    pub kind: AggregateKind,
    pub id: String,
}

// The membership vocabulary, one name per aggregate kind. These types are
// written by the server only — the envelope allowlist rejects them on the
// generic append path. They live next to the mapping below so a new kind
// gets its names in one place.
pub const LIST_MEMBER_ADDED: &str = "lists/listMemberAdded";
pub const LIST_MEMBER_REMOVED: &str = "lists/listMemberRemoved";
pub const RECIPE_MEMBER_ADDED: &str = "recipes/recipeMemberAdded";
pub const RECIPE_MEMBER_REMOVED: &str = "recipes/recipeMemberRemoved";
pub const PLAN_MEMBER_ADDED: &str = "plans/planMemberAdded";
pub const PLAN_MEMBER_REMOVED: &str = "plans/planMemberRemoved";

// Deleting ends every membership, so the server writes the delete event
// itself (`DELETE /{collection}/{id}`) rather than taking it from a client.
pub const LIST_DELETED: &str = "lists/listDeleted";
pub const RECIPE_DELETED: &str = "recipes/recipeDeleted";
pub const PLAN_DELETED: &str = "plans/planDeleted";

impl Aggregate {
    pub fn list(id: impl Into<String>) -> Self {
        Self { kind: AggregateKind::List, id: id.into() }
    }

    pub fn recipe(id: impl Into<String>) -> Self {
        Self { kind: AggregateKind::Recipe, id: id.into() }
    }

    pub fn plan(id: impl Into<String>) -> Self {
        Self { kind: AggregateKind::Plan, id: id.into() }
    }

    /// Event type the server writes when somebody joins this aggregate.
    /// Sharing is one mechanism for all three kinds (sharing-model.md), but
    /// each kind keeps its own event type so clients fold it into the slice
    /// that owns the aggregate.
    pub fn member_added_event(&self) -> &'static str {
        match self.kind {
            AggregateKind::List => LIST_MEMBER_ADDED,
            AggregateKind::Recipe => RECIPE_MEMBER_ADDED,
            AggregateKind::Plan => PLAN_MEMBER_ADDED,
        }
    }

    /// Counterpart of `member_added_event`, written on removal and leaving.
    pub fn member_removed_event(&self) -> &'static str {
        match self.kind {
            AggregateKind::List => LIST_MEMBER_REMOVED,
            AggregateKind::Recipe => RECIPE_MEMBER_REMOVED,
            AggregateKind::Plan => PLAN_MEMBER_REMOVED,
        }
    }

    /// Event type that closes this aggregate's log. Like the member events
    /// it exists once per kind, so the client folds it into the slice that
    /// owns the aggregate.
    pub fn deleted_event(&self) -> &'static str {
        match self.kind {
            AggregateKind::List => LIST_DELETED,
            AggregateKind::Recipe => RECIPE_DELETED,
            AggregateKind::Plan => PLAN_DELETED,
        }
    }

    /// Payload key naming this aggregate in its own events — the field the
    /// envelope matches against and the client reads to route the fold.
    pub fn payload_id_field(&self) -> &'static str {
        match self.kind {
            AggregateKind::List => "listId",
            AggregateKind::Recipe => "recipeId",
            AggregateKind::Plan => "planId",
        }
    }

    pub fn partition_key(&self) -> String {
        format!("{}{}", self.kind.partition_prefix(), self.id)
    }

    /// Inverse of `partition_key`. None for rows that are not an aggregate
    /// log at all — the membership table also holds address book and invite
    /// rows under their own prefixes.
    pub fn from_partition_key(partition_key: &str) -> Option<Self> {
        AggregateKind::ALL.into_iter().find_map(|kind| {
            partition_key
                .strip_prefix(kind.partition_prefix())
                .map(|id| Self { kind, id: id.to_string() })
        })
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
