use thiserror::Error;

use crate::event::{AggregateId, UserId};
use crate::limits::INVITE_TTL_MS;
use crate::membership::{check_can_invite, MembershipViolation};
use crate::ports::{InviteStore, MembershipStore, StoreError, StoredInvite};

#[derive(Debug, Error)]
pub enum CreateInviteError {
    #[error(transparent)]
    NotAllowed(#[from] MembershipViolation),
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct CreateInviteRequest {
    pub aggregate: AggregateId,
    /// Minted by the lambda, so the domain stays deterministic and
    /// replayable in tests.
    pub fresh_token: String,
    pub now_ms: u64,
}

/// Class 2: only the owner mints invite tokens (`events.md` owner model).
/// One active token per aggregate — a repeated create hands out the existing
/// one while it is valid, so link and QR stay stable across visits.
pub async fn create_invite(
    membership: &dyn MembershipStore,
    invites: &dyn InviteStore,
    caller: &UserId,
    request: CreateInviteRequest,
) -> Result<StoredInvite, CreateInviteError> {
    let aggregate = request.aggregate;
    let role = membership.role_of(&aggregate, caller).await?;
    check_can_invite(role)?;

    if let Some(active) = invites.invite_for(&aggregate).await? {
        if active.expires_at_ms > request.now_ms {
            return Ok(active);
        }
    }

    let invite = StoredInvite {
        token: request.fresh_token,
        aggregate,
        expires_at_ms: request.now_ms + INVITE_TTL_MS,
    };
    invites.put_invite(&invite).await?;
    Ok(invite)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::membership::MembershipViolation;
    use crate::memory::{MemoryInviteStore, MemoryMembershipStore};
    use crate::ports::MemberRole;

    async fn owned_by(user: &str) -> MemoryMembershipStore {
        MemoryMembershipStore::new()
            .with_member(
                &AggregateId::list("abc"),
                &UserId(user.into()),
                MemberRole::Owner,
            )
            .await
    }

    fn request(token: &str, now_ms: u64) -> CreateInviteRequest {
        CreateInviteRequest {
            aggregate: AggregateId::list("abc"),
            fresh_token: token.into(),
            now_ms,
        }
    }

    #[tokio::test]
    async fn the_owner_gets_a_token_valid_for_seven_days() {
        let membership = owned_by("mama").await;
        let invites = MemoryInviteStore::new();

        let invite = create_invite(
            &membership,
            &invites,
            &UserId("mama".into()),
            request("tok-1", 1_000),
        )
        .await
        .expect("owner may invite");

        assert_eq!(invite.token, "tok-1");
        assert_eq!(invite.expires_at_ms, 1_000 + INVITE_TTL_MS);
    }

    #[tokio::test]
    async fn a_repeated_create_reuses_the_active_token() {
        let membership = owned_by("mama").await;
        let invites = MemoryInviteStore::new();
        create_invite(
            &membership,
            &invites,
            &UserId("mama".into()),
            request("tok-1", 1_000),
        )
        .await
        .expect("first");

        let second = create_invite(
            &membership,
            &invites,
            &UserId("mama".into()),
            request("tok-2", 2_000),
        )
        .await
        .expect("second");

        assert_eq!(second.token, "tok-1");
    }

    #[tokio::test]
    async fn an_expired_token_is_replaced() {
        let membership = owned_by("mama").await;
        let invites = MemoryInviteStore::new();
        create_invite(
            &membership,
            &invites,
            &UserId("mama".into()),
            request("tok-1", 0),
        )
        .await
        .expect("first");

        let after_expiry = create_invite(
            &membership,
            &invites,
            &UserId("mama".into()),
            request("tok-2", INVITE_TTL_MS + 1),
        )
        .await
        .expect("replaces");

        assert_eq!(after_expiry.token, "tok-2");
        assert_eq!(
            after_expiry.expires_at_ms,
            INVITE_TTL_MS + 1 + INVITE_TTL_MS
        );
    }

    #[tokio::test]
    async fn a_plain_member_may_not_invite() {
        let membership = MemoryMembershipStore::new()
            .with_member(
                &AggregateId::list("abc"),
                &UserId("tom".into()),
                MemberRole::Member,
            )
            .await;
        let invites = MemoryInviteStore::new();

        let result = create_invite(
            &membership,
            &invites,
            &UserId("tom".into()),
            request("tok-1", 0),
        )
        .await;

        assert!(matches!(
            result,
            Err(CreateInviteError::NotAllowed(MembershipViolation::OwnerOnly))
        ));
    }

    #[tokio::test]
    async fn a_stranger_may_not_invite() {
        let membership = MemoryMembershipStore::new();
        let invites = MemoryInviteStore::new();

        let result = create_invite(
            &membership,
            &invites,
            &UserId("eve".into()),
            request("tok-1", 0),
        )
        .await;

        assert!(matches!(
            result,
            Err(CreateInviteError::NotAllowed(
                MembershipViolation::NotAMember
            ))
        ));
    }
}
