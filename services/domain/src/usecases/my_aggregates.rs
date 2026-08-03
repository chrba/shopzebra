use crate::event::{Aggregate, AggregateKind, UserId};
use crate::ports::{Ports, StoreError, UserDirectory};

/// One aggregate as an overview needs it: its id plus the owner's display
/// name. The name cannot come from the event log — `listCreated` carries
/// the list's name, not the owner's, and the owner never triggers a
/// member-added event for themselves.
#[derive(Debug, PartialEq, Eq)]
pub struct AggregateSummary {
    pub id: String,
    /// None when the owner has not set a name; the client decides how to
    /// fall back rather than having a German placeholder baked in here.
    pub owner_name: Option<String>,
}

/// The aggregates of one kind the caller belongs to, each with its owner's
/// display name. One endpoint per kind (`GET /lists`, `GET /recipes`) reads
/// this, so a collection screen never sees the other kinds.
pub async fn aggregates_with_owners(
    ports: &Ports<'_>,
    users: &dyn UserDirectory,
    caller_id: &UserId,
    kind: AggregateKind,
) -> Result<Vec<AggregateSummary>, StoreError> {
    let aggregates = my_aggregates(ports, caller_id, kind).await?;

    let mut summaries = Vec::with_capacity(aggregates.len());
    for aggregate in aggregates {
        let owner_name = match ports.membership.owner_of(&aggregate).await? {
            Some(owner_id) => users.display_name(&owner_id).await?,
            None => None,
        };
        summaries.push(AggregateSummary {
            id: aggregate.id,
            owner_name,
        });
    }
    Ok(summaries)
}

/// Which aggregates of one kind the caller is a member of — the bootstrap
/// question of a new device and the fan-out for the per-aggregate cursor
/// catch-up (sync-engine.md §4). Authorization is inherent: the caller
/// identity comes from the verified JWT, the membership projection is
/// server-owned.
pub async fn my_aggregates(
    ports: &Ports<'_>,
    caller_id: &UserId,
    kind: AggregateKind,
) -> Result<Vec<Aggregate>, StoreError> {
    let aggregates = ports.membership.aggregates_of(caller_id).await?;
    Ok(aggregates
        .into_iter()
        .filter(|aggregate| aggregate.kind == kind)
        .collect())
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
            .with_member(&Aggregate::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await
            .with_member(&Aggregate::list("def"), &UserId("mama".into()), MemberRole::Member)
            .await
            .with_member(&Aggregate::list("xyz"), &UserId("papa".into()), MemberRole::Owner)
            .await;
        let publisher = MemoryEventPublisher::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let mut list_ids: Vec<String> =
            my_aggregates(&ports, &UserId("mama".into()), AggregateKind::List)
                .await
                .expect("readable")
                .into_iter()
                .map(|aggregate| aggregate.id)
                .collect();
        list_ids.sort();

        assert_eq!(list_ids, vec!["abc".to_string(), "def".to_string()]);
    }

    #[tokio::test]
    async fn asking_for_recipes_never_returns_a_list() {
        let store = MemoryEventStore::new();
        let mama = UserId("mama".into());
        let membership = MemoryMembershipStore::new()
            .with_member(&Aggregate::list("abc"), &mama, MemberRole::Owner)
            .await
            .with_member(&Aggregate::recipe("bolo"), &mama, MemberRole::Owner)
            .await;
        let publisher = MemoryEventPublisher::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let recipes = my_aggregates(&ports, &mama, AggregateKind::Recipe)
            .await
            .expect("readable");

        assert_eq!(recipes, vec![Aggregate::recipe("bolo")]);
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
            .with_member(&Aggregate::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await
            .with_member(&Aggregate::list("abc"), &UserId("tom".into()), MemberRole::Member)
            .await;
        let publisher = MemoryEventPublisher::new();
        let users = MemoryUserDirectory::new().with_name("mama", "Sarah");
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let summaries = aggregates_with_owners(
            &ports,
            &users,
            &UserId("tom".into()),
            AggregateKind::List,
        )
        .await
        .expect("readable");

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, "abc");
        assert_eq!(summaries[0].owner_name.as_deref(), Some("Sarah"));
    }

    #[tokio::test]
    async fn an_owner_without_a_name_yields_none_rather_than_a_placeholder() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new()
            .with_member(&Aggregate::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await;
        let publisher = MemoryEventPublisher::new();
        let users = MemoryUserDirectory::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let summaries = aggregates_with_owners(
            &ports,
            &users,
            &UserId("mama".into()),
            AggregateKind::List,
        )
        .await
        .expect("readable");

        assert_eq!(summaries[0].owner_name, None);
    }

    #[tokio::test]
    async fn a_shared_recipe_carries_its_owners_name_just_like_a_list() {
        let store = MemoryEventStore::new();
        let recipe = Aggregate::recipe("bolo");
        let membership = MemoryMembershipStore::new()
            .with_member(&recipe, &UserId("mama".into()), MemberRole::Owner)
            .await
            .with_member(&recipe, &UserId("tom".into()), MemberRole::Member)
            .await;
        let publisher = MemoryEventPublisher::new();
        let users = MemoryUserDirectory::new().with_name("mama", "Sarah");
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let summaries = aggregates_with_owners(
            &ports,
            &users,
            &UserId("tom".into()),
            AggregateKind::Recipe,
        )
        .await
        .expect("readable");

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, "bolo");
        assert_eq!(summaries[0].owner_name.as_deref(), Some("Sarah"));
    }
}
