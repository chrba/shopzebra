//! Secondary adapters: infrastructure implementations of the domain
//! ports — DynamoDB for the stores, Cognito for the user directory.

pub mod cognito_user_directory;
pub mod dynamodb_event_store;
pub mod dynamodb_friends;
pub mod dynamodb_invites;
pub mod dynamodb_membership;
pub mod noop_publisher;

pub use cognito_user_directory::CognitoUserDirectory;
pub use dynamodb_event_store::DynamoDbEventStore;
pub use dynamodb_friends::{DynamoDbFriendInviteStore, DynamoDbFriendStore};
pub use dynamodb_invites::DynamoDbInviteStore;
pub use dynamodb_membership::DynamoDbMembershipStore;
pub use noop_publisher::NoopEventPublisher;
