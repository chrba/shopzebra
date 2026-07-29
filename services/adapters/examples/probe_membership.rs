//! Diagnostic probe: calls the membership adapter directly against AWS,
//! read-only, bypassing the Lambda layer entirely. Run with:
//!   AWS_PROFILE=shopzebra AWS_REGION=eu-central-1 \
//!   MEMBERSHIP_TABLE=<name> cargo run -p adapters --example probe_membership

use adapters::DynamoDbMembershipStore;
use aws_sdk_dynamodb::Client;
use domain::event::UserId;
use domain::ports::MembershipStore;

#[tokio::main]
async fn main() {
    println!("loading aws config…");
    let config = aws_config::load_from_env().await;
    let client = Client::new(&config);
    let table = std::env::var("MEMBERSHIP_TABLE").expect("MEMBERSHIP_TABLE");
    let membership = DynamoDbMembershipStore::new(client, table);

    println!("querying aggregates_of…");
    let started = std::time::Instant::now();
    let result = membership.aggregates_of(&UserId("nobody".into())).await;
    println!("finished after {:?}: {:?}", started.elapsed(), result.map(|list| list.len()));
}
