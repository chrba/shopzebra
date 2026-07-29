use async_trait::async_trait;

use domain::event::StoredEvent;
use domain::ports::{EventPublisher, StoreError};

/// Placeholder until AppSync Events is provisioned. Broadcasting is a
/// latency optimization only — clients catch up via the cursor.
pub struct NoopEventPublisher;

#[async_trait]
impl EventPublisher for NoopEventPublisher {
    async fn publish(&self, _channel: &str, _event: &StoredEvent) -> Result<(), StoreError> {
        Ok(())
    }
}
