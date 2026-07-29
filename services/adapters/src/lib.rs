//! Secondary adapters: DynamoDB implementations of the domain ports.

pub mod dynamodb_event_store;
pub mod dynamodb_membership;
pub mod noop_publisher;

pub use dynamodb_event_store::DynamoDbEventStore;
pub use dynamodb_membership::DynamoDbMembershipStore;
pub use noop_publisher::NoopEventPublisher;
