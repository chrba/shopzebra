use serde_json::{Map, Value};
use thiserror::Error;

use crate::event::{Aggregate, UserId};
use crate::ports::MemberRole;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum MembershipViolation {
    #[error("caller is not a member of this aggregate")]
    NotAMember,
    #[error("only the owner may do this")]
    OwnerOnly,
}

/// Class-1 events: any member may append.
pub fn check_can_append(role: Option<MemberRole>) -> Result<(), MembershipViolation> {
    match role {
        Some(_) => Ok(()),
        None => Err(MembershipViolation::NotAMember),
    }
}

/// Reading the log: any member, nobody else.
pub fn check_can_read(role: Option<MemberRole>) -> Result<(), MembershipViolation> {
    match role {
        Some(_) => Ok(()),
        None => Err(MembershipViolation::NotAMember),
    }
}

/// Invites are owner-only (owner model, domain-model.md §2).
pub fn check_can_invite(role: Option<MemberRole>) -> Result<(), MembershipViolation> {
    match role {
        Some(MemberRole::Owner) => Ok(()),
        Some(MemberRole::Member) => Err(MembershipViolation::OwnerOnly),
        None => Err(MembershipViolation::NotAMember),
    }
}

/// The owner removes anyone; a member only themselves.
pub fn check_can_remove(
    caller_role: Option<MemberRole>,
    caller_is_target: bool,
) -> Result<(), MembershipViolation> {
    match caller_role {
        Some(MemberRole::Owner) => Ok(()),
        Some(MemberRole::Member) if caller_is_target => Ok(()),
        Some(MemberRole::Member) => Err(MembershipViolation::OwnerOnly),
        None => Err(MembershipViolation::NotAMember),
    }
}

/// Payload of a member-joined event. Every aggregate names itself under its
/// own key (`listId`, `recipeId`, …) so the client folds it into the slice
/// that owns the aggregate.
pub fn member_added_payload(aggregate: &Aggregate, member_id: &UserId, name: &str) -> Value {
    let mut payload = identity_of(aggregate, member_id);
    payload.insert("name".into(), Value::String(name.into()));
    Value::Object(payload)
}

/// Payload of a member-left event — the same identity, without the name:
/// whoever folds it already knows the member.
pub fn member_removed_payload(aggregate: &Aggregate, member_id: &UserId) -> Value {
    Value::Object(identity_of(aggregate, member_id))
}

fn identity_of(aggregate: &Aggregate, member_id: &UserId) -> Map<String, Value> {
    let mut identity = Map::new();
    identity.insert(
        aggregate.payload_id_field().into(),
        Value::String(aggregate.id.clone()),
    );
    identity.insert("memberId".into(), Value::String(member_id.0.clone()));
    identity
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_member_event_names_its_aggregate_under_the_key_of_its_kind() {
        let tom = UserId("tom".into());

        assert_eq!(
            member_added_payload(&Aggregate::list("abc"), &tom, "Tom"),
            serde_json::json!({ "listId": "abc", "memberId": "tom", "name": "Tom" })
        );
        assert_eq!(
            member_added_payload(&Aggregate::recipe("r1"), &tom, "Tom"),
            serde_json::json!({ "recipeId": "r1", "memberId": "tom", "name": "Tom" })
        );
        assert_eq!(
            member_removed_payload(&Aggregate::recipe("r1"), &tom),
            serde_json::json!({ "recipeId": "r1", "memberId": "tom" })
        );
    }

    #[test]
    fn members_and_owners_may_append_strangers_may_not() {
        assert!(check_can_append(Some(MemberRole::Owner)).is_ok());
        assert!(check_can_append(Some(MemberRole::Member)).is_ok());
        assert_eq!(check_can_append(None), Err(MembershipViolation::NotAMember));
    }

    #[test]
    fn only_the_owner_invites() {
        assert!(check_can_invite(Some(MemberRole::Owner)).is_ok());
        assert_eq!(check_can_invite(Some(MemberRole::Member)), Err(MembershipViolation::OwnerOnly));
        assert_eq!(check_can_invite(None), Err(MembershipViolation::NotAMember));
    }

    #[test]
    fn owner_removes_anyone_members_only_themselves() {
        assert!(check_can_remove(Some(MemberRole::Owner), false).is_ok());
        assert!(check_can_remove(Some(MemberRole::Member), true).is_ok());
        assert_eq!(check_can_remove(Some(MemberRole::Member), false), Err(MembershipViolation::OwnerOnly));
        assert_eq!(check_can_remove(None, true), Err(MembershipViolation::NotAMember));
    }
}
