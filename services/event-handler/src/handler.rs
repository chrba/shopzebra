

use aws_sdk_dynamodb::error::SdkError;
use aws_sdk_dynamodb::operation::put_item::PutItemError;
use lambda_runtime::{ Error, LambdaEvent, run, service_fn, tracing::info };
use serde::{Deserialize, Serialize};
use aws_sdk_dynamodb::Client;

use std::collections::HashMap;
use aws_sdk_dynamodb::types::AttributeValue;
use serde_dynamo::to_item;
use ulid::Ulid;

#[derive(Debug, Clone, Deserialize, Serialize)]
struct ListCreated {
    id: String,
    name: String,
    member_ids: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
enum EventData {
    ListCreated(ListCreated)
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Event {
    id: String,
    source: String,
    even_type: String,
    specversion: String,
    data: EventData
}



pub enum ApiError {
    Conflict(String),
    BadRequest(String),
    InternalServerError(String)
}

pub async fn handle(event: LambdaEvent<Event>, client: &Client) -> Result<String, Error> {
    info!("Got event {:?}", event);

    let user = "user";


    Ok("Done1".into())
}



async fn persist(event: &Event, user: &str, client: &Client) -> Result<(), Error> {
    let ulid = Ulid::new();
    let mut item: HashMap<String, AttributeValue> = to_item(event)?;
    item.insert("pk0".into(), AttributeValue::S(format!("USER#{}", user)));
    item.insert("sk0".into(), AttributeValue::S(format!("ULID#{}", ulid.to_string())));

    client.put_item()
        .table_name("Events")
        .set_item(Some(item))
        .send()
        .await?;

    Ok(())
}


async fn is_duplicate_event(user: &str, event_id: &str, client: &Client) -> Result<bool, Error> {
    let res = client.put_item()
        .table_name("Events")
        .item("pk0", AttributeValue::S(format!("DEDUP#USER#{}#EVENT_ID#{}", user, event_id)))
        .condition_expression("attribute_not_exists(pk0)")
        .send()
        .await;

    match res {
        Ok(_) => Ok(false),
        Err(SdkError::ServiceError(err)) => match err.err() {
            PutItemError::ConditionalCheckFailedException(_) => Ok(true),
            other => Err(format!("Unexpected PutItem error: {other:?}").into()),
        },
        Err(err) => Err(Box::new(err)),
    }
}
