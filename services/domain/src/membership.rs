use thiserror::Error;

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

#[cfg(test)]
mod tests {
    use super::*;

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
