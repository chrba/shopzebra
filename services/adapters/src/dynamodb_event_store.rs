use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use aws_sdk_dynamodb::error::SdkError;
use aws_sdk_dynamodb::operation::transact_write_items::TransactWriteItemsError;
use aws_sdk_dynamodb::types::{AttributeValue, Put, TransactWriteItem};
use aws_sdk_dynamodb::Client;

use domain::event::{AggregateId, NewEvent, Position, StoredEvent, UserId};
use domain::ports::{EventStore, StoreError};

const EVENT_PREFIX: &str = "EVT#";
const DEDUP_PREFIX: &str = "DUP#";
const APPEND_RETRIES: usize = 5;

/// Item layout in one partition (pk = aggregate partition key):
///   sk "EVT#<position>"  — the event itself; position is a zero-padded,
///                          gap-free sequence number per aggregate
///   sk "DUP#<event_id>"  — idempotency marker pointing at the position
///
/// The position itself is the ordering guarantee: an append targets
/// last + 1, and `attribute_not_exists` on the event item lets exactly
/// one writer take a position. A lost race means somebody else appended
/// first — re-read, retry one position later. No clock is involved, so
/// no skew can reorder the log (sync-engine.md §6).
pub struct DynamoDbEventStore {
    client: Client,
    table_name: String,
}

impl DynamoDbEventStore {
    pub fn new(client: Client, table_name: String) -> Self {
        Self { client, table_name }
    }

    /// The highest position in the aggregate log, read strongly
    /// consistent — the candidate for the next append is this + 1.
    async fn last_position(&self, aggregate: &AggregateId) -> Result<Option<Position>, StoreError> {
        let newest_first = self
            .client
            .query()
            .table_name(&self.table_name)
            .key_condition_expression("pk = :pk AND begins_with(sk, :event_prefix)")
            .expression_attribute_values(":pk", AttributeValue::S(aggregate.partition_key()))
            .expression_attribute_values(":event_prefix", AttributeValue::S(EVENT_PREFIX.into()))
            .scan_index_forward(false)
            .limit(1)
            .consistent_read(true)
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        newest_first
            .items()
            .first()
            .map(|item| position_from_sort_key(&string_attribute(item, "sk")?))
            .transpose()
    }

    async fn stored_event_for_dedup(
        &self,
        aggregate: &AggregateId,
        event_id: &str,
    ) -> Result<Option<StoredEvent>, StoreError> {
        let marker = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(aggregate.partition_key()))
            .key("sk", AttributeValue::S(format!("{DEDUP_PREFIX}{event_id}")))
            .consistent_read(true)
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        let Some(position) = marker
            .item
            .and_then(|item| item.get("position").and_then(|value| value.as_s().ok().cloned()))
        else {
            return Ok(None);
        };

        let event = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", AttributeValue::S(aggregate.partition_key()))
            .key("sk", AttributeValue::S(format!("{EVENT_PREFIX}{position}")))
            .consistent_read(true)
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        Ok(event.item.map(parse_event_item).transpose()?)
    }
}

fn string_attribute(
    item: &HashMap<String, AttributeValue>,
    name: &str,
) -> Result<String, StoreError> {
    item.get(name)
        .and_then(|value| value.as_s().ok().cloned())
        .ok_or_else(|| StoreError(format!("event item is missing attribute {name}")))
}

fn position_from_sort_key(sort_key: &str) -> Result<Position, StoreError> {
    sort_key
        .strip_prefix(EVENT_PREFIX)
        .ok_or_else(|| StoreError("not an event item".into()))?
        .parse()
        .map_err(|_| StoreError(format!("sort key {sort_key} holds no position")))
}

fn parse_event_item(item: HashMap<String, AttributeValue>) -> Result<StoredEvent, StoreError> {
    let position = position_from_sort_key(&string_attribute(&item, "sk")?)?;
    let payload_text = string_attribute(&item, "payload")?;
    let payload = serde_json::from_str(&payload_text)
        .map_err(|error| StoreError(format!("stored payload is not JSON: {error}")))?;
    Ok(StoredEvent {
        position,
        event_type: string_attribute(&item, "eventType")?,
        payload,
        event_id: string_attribute(&item, "eventId")?,
        device_id: string_attribute(&item, "deviceId")?,
        user_id: UserId(string_attribute(&item, "userId")?),
    })
}

fn epoch_millis() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since_epoch| since_epoch.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

/// Which condition inside the transaction failed. Item order is
/// [event, dedup] — see the transact_items calls in append().
enum CanceledBecause {
    PositionTaken,
    DuplicateEventId,
    Other,
}

fn cancellation_cause(error: &SdkError<TransactWriteItemsError>) -> CanceledBecause {
    let SdkError::ServiceError(service_error) = error else {
        return CanceledBecause::Other;
    };
    let TransactWriteItemsError::TransactionCanceledException(canceled) = service_error.err()
    else {
        return CanceledBecause::Other;
    };
    let condition_failed = |index: usize| {
        canceled
            .cancellation_reasons()
            .get(index)
            .and_then(|reason| reason.code())
            .is_some_and(|code| code == "ConditionalCheckFailed")
    };
    if condition_failed(1) {
        CanceledBecause::DuplicateEventId
    } else if condition_failed(0) {
        CanceledBecause::PositionTaken
    } else {
        CanceledBecause::Other
    }
}

#[async_trait]
impl EventStore for DynamoDbEventStore {
    async fn append(
        &self,
        aggregate: &AggregateId,
        event: NewEvent,
    ) -> Result<StoredEvent, StoreError> {
        let partition_key = aggregate.partition_key();
        let payload_text = serde_json::to_string(&event.payload)
            .map_err(|error| StoreError(error.to_string()))?;

        for _ in 0..APPEND_RETRIES {
            let position = self
                .last_position(aggregate)
                .await?
                .map_or_else(Position::first, |last| last.next());

            let event_put = Put::builder()
                .table_name(&self.table_name)
                .item("pk", AttributeValue::S(partition_key.clone()))
                .item("sk", AttributeValue::S(format!("{EVENT_PREFIX}{position}")))
                .item("eventType", AttributeValue::S(event.event_type.clone()))
                .item("payload", AttributeValue::S(payload_text.clone()))
                .item("eventId", AttributeValue::S(event.event_id.clone()))
                .item("deviceId", AttributeValue::S(event.device_id.clone()))
                .item("userId", AttributeValue::S(event.user_id.0.clone()))
                .item("appendedAt", AttributeValue::N(epoch_millis()))
                .condition_expression("attribute_not_exists(sk)")
                .build()
                .map_err(|error| StoreError(error.to_string()))?;

            let dedup_put = Put::builder()
                .table_name(&self.table_name)
                .item("pk", AttributeValue::S(partition_key.clone()))
                .item("sk", AttributeValue::S(format!("{DEDUP_PREFIX}{}", event.event_id)))
                .item("position", AttributeValue::S(position.to_string()))
                .condition_expression("attribute_not_exists(sk)")
                .build()
                .map_err(|error| StoreError(error.to_string()))?;

            let result = self
                .client
                .transact_write_items()
                .transact_items(TransactWriteItem::builder().put(event_put).build())
                .transact_items(TransactWriteItem::builder().put(dedup_put).build())
                .send()
                .await;

            match result {
                Ok(_) => {
                    return Ok(StoredEvent {
                        position,
                        event_type: event.event_type,
                        payload: event.payload,
                        event_id: event.event_id,
                        device_id: event.device_id,
                        user_id: event.user_id,
                    })
                }
                Err(error) => match cancellation_cause(&error) {
                    // Retry of an already appended event — idempotent success.
                    CanceledBecause::DuplicateEventId => {
                        return self
                            .stored_event_for_dedup(aggregate, &event.event_id)
                            .await?
                            .ok_or_else(|| StoreError("dedup marker without event".into()));
                    }
                    // A concurrent writer took this position — try the next one.
                    CanceledBecause::PositionTaken => continue,
                    CanceledBecause::Other => return Err(StoreError(error.to_string())),
                },
            }
        }

        Err(StoreError("append retries exhausted".into()))
    }

    async fn events_since(
        &self,
        aggregate: &AggregateId,
        since: Option<&Position>,
    ) -> Result<Vec<StoredEvent>, StoreError> {
        let first_wanted = since.map_or_else(Position::first, Position::next);
        let lower_bound = format!("{EVENT_PREFIX}{first_wanted}");
        let upper_bound = format!("{EVENT_PREFIX}{}", Position(u64::MAX));

        let mut events = Vec::new();
        let mut last_evaluated_key = None;
        loop {
            let page = self
                .client
                .query()
                .table_name(&self.table_name)
                .key_condition_expression("pk = :pk AND sk BETWEEN :lo AND :hi")
                .expression_attribute_values(":pk", AttributeValue::S(aggregate.partition_key()))
                .expression_attribute_values(":lo", AttributeValue::S(lower_bound.clone()))
                .expression_attribute_values(":hi", AttributeValue::S(upper_bound.clone()))
                .set_exclusive_start_key(last_evaluated_key)
                .send()
                .await
                .map_err(|error| StoreError(error.to_string()))?;

            for item in page.items() {
                events.push(parse_event_item(item.clone())?);
            }

            last_evaluated_key = page.last_evaluated_key().cloned();
            if last_evaluated_key.is_none() {
                break;
            }
        }
        Ok(events)
    }
}
