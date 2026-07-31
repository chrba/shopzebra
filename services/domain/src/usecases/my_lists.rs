use crate::event::{AggregateId, UserId};
use crate::ports::{Ports, StoreError, UserDirectory};

/// One list as the overview needs it: its id plus the owner's display
/// name. The name cannot come from the event log — `listCreated` carries
/// the list's name, not the owner's, and the owner never triggers a
/// `listMemberAdded` for themselves.
#[derive(Debug, PartialEq, Eq)]
pub struct ListSummary {
    pub list_id: String,
    /// None when the owner has not set a name; the client decides how to
    /// fall back rather than having a German placeholder baked in here.
    pub owner_name: Option<String>,
}

/// The lists the caller belongs to, each with its owner's display name.
pub async fn my_lists_with_owners(
    ports: &Ports<'_>,
    users: &dyn UserDirectory,
    caller: &UserId,
) -> Result<Vec<ListSummary>, StoreError> {
    let aggregates = ports.membership.aggregates_of(caller).await?;

    let mut summaries = Vec::with_capacity(aggregates.len());
    for aggregate in aggregates {
        let owner_name = match ports.membership.owner_of(&aggregate).await? {
            Some(owner) => users.display_name(&owner).await?,
            None => None,
        };
        summaries.push(ListSummary {
            list_id: aggregate.id,
            owner_name,
        });
    }
    Ok(summaries)
}

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

#[cfg(test)]
mod owner_name_tests {
    use super::*;
    use crate::memory::{
        MemoryEventPublisher, MemoryEventStore, MemoryMembershipStore, MemoryUserDirectory,
    };
    use crate::ports::MemberRole;

    #[tokio::test]
    async fn every_list_carries_its_owners_display_name() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new()
            .with_member(&AggregateId::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await
            .with_member(&AggregateId::list("abc"), &UserId("tom".into()), MemberRole::Member)
            .await;
        let publisher = MemoryEventPublisher::new();
        let users = MemoryUserDirectory::new().with_name("mama", "Sarah");
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let summaries = my_lists_with_owners(&ports, &users, &UserId("tom".into()))
            .await
            .expect("readable");

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].list_id, "abc");
        assert_eq!(summaries[0].owner_name.as_deref(), Some("Sarah"));
    }

    #[tokio::test]
    async fn an_owner_without_a_name_yields_none_rather_than_a_placeholder() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new()
            .with_member(&AggregateId::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await;
        let publisher = MemoryEventPublisher::new();
        let users = MemoryUserDirectory::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let summaries = my_lists_with_owners(&ports, &users, &UserId("mama".into()))
            .await
            .expect("readable");

        assert_eq!(summaries[0].owner_name, None);
    }
}
