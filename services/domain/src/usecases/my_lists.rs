use crate::event::{AggregateId, UserId};
use crate::ports::{Ports, StoreError};

/// Which lists the caller is a member of — the bootstrap question of a
/// new device and the fan-out for the per-list cursor catch-up
/// (sync-engine.md §4). Authorization is inherent: the caller identity
/// comes from the verified JWT, the membership projection is
/// server-owned.
pub async fn my_lists(ports: &Ports<'_>, caller: &UserId) -> Result<Vec<AggregateId>, StoreError> {
    ports.membership.aggregates_of(caller).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{MemoryEventPublisher, MemoryEventStore, MemoryMembershipStore};
    use crate::ports::MemberRole;

    #[tokio::test]
    async fn returns_only_the_lists_the_caller_belongs_to() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new()
            .with_member(&AggregateId::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await
            .with_member(&AggregateId::list("def"), &UserId("mama".into()), MemberRole::Member)
            .await
            .with_member(&AggregateId::list("xyz"), &UserId("papa".into()), MemberRole::Owner)
            .await;
        let publisher = MemoryEventPublisher::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let mut list_ids: Vec<String> = my_lists(&ports, &UserId("mama".into()))
            .await
            .expect("readable")
            .into_iter()
            .map(|aggregate| aggregate.id)
            .collect();
        list_ids.sort();

        assert_eq!(list_ids, vec!["abc".to_string(), "def".to_string()]);
    }
}
