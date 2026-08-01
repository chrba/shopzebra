//! Product limits. Change a number here — it appears nowhere else in the
//! code, and the tests compute their expectations from these constants so a
//! change does not break a dozen assertions.

/// Members a single list may have, the owner included. Two parents plus four
/// children fit exactly. Enforced server-side at every entry point, because
/// the endpoints are open and a client-side check would be worthless.
///
/// The clients do not carry their own copy: `GET /lists` hands the number out
/// as `maxMembers`, so the UI's "6 von 6" comes from here too.
pub const MAX_LIST_MEMBERS: usize = 6;

/// How long an invite token stays valid — both list and friendship invites.
pub const INVITE_TTL_MS: u64 = 7 * 24 * 60 * 60 * 1000;
