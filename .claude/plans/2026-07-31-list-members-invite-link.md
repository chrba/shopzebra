# Listen-Mitglieder & Invite-Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Listen-Owner kann Mitglieder per Invite-Link einladen (Copy, WhatsApp, E-Mail; QR als Attrappe); der Eingeladene tritt über `/join/$token` bei, der Server schreibt `lists/listMemberAdded`, alle Geräte falten es per Sync.

**Architecture:** Zwei neue Klasse-2-Commands (`POST /lists/{listId}/invites`, `POST /lists/join`) als eigene Rust-Lambdas nach dem `create-list`-Muster; neue Domain-Ports `InviteStore` + `UserDirectory` werden als **separate Use-Case-Parameter** gereicht (die `Ports`-Struct und damit alle bestehenden Lambdas/Tests bleiben unangetastet). Frontend: neuer Reducer-Key `listMemberAdded` im lists-Slice (Wire-Type = Action-Type, kein Mapping), Members-Page nach `design/pure/invite.html`, Join-Route mit Loader. Invite-Token-Beschaffung ist die dokumentierte Thunk/Direct-Fetch-Ausnahme (Server-Antwort VOR Anzeige nötig).

**Tech Stack:** Rust (lambda_http, aws-sdk-dynamodb, aws-sdk-cognitoidentityprovider, uuid), CDK (cargo-lambda-cdk), React + TanStack Router + eigener Redux-createSlice, Tailwind v4 + shadcn-Primitives, Vitest.

## Global Constraints

- Kommentare im Code **immer Englisch** (root CLAUDE.md).
- Kein `any`, kein `as`, `const` statt `let`, `readonly` Props, `type` statt `interface` (root CLAUDE.md).
- Reducer replay-pur: kein `Date.now()`/`randomUUID()` im Reducer — IDs/Zeiten entstehen außerhalb.
- **Bestehende Tests niemals ändern** (User-Policy). Alle neuen Tests in neue Dateien bzw. neue Rust-`#[cfg(test)]`-Funktionen; bestehende Testfunktionen bleiben byte-identisch. Wo eine Typ-Erweiterung bestehende Tests brechen würde, ist das Feld optional (`memberNames?`).
- Klasse-2-Events (`lists/listMemberAdded`) **nicht** in die Envelope-`ALLOWLIST` aufnehmen — der Test `rejects_class_2_types_on_the_generic_append_path` schützt genau das. Der Server konstruiert das Payload selbst aus vertrauenswürdigen Daten, keine Schema-Validierung nötig.
- Pfad-Parameter im API Gateway heißt `{listId}` (Konsistenz mit `path_parameters().first("listId")`).
- Nach Backend-Änderungen: `cargo test` (in `services/`) **und** `pnpm test` + `pnpm cdk synth --quiet` (in `apps/infrastructure/`) — cargo-lambda bundelt beim Synth den ganzen Workspace (Memory-Feedback).
- Frontend-Verifikation: `pnpm exec tsc --noEmit && pnpm exec vitest run` in `apps/mobile/`.
- Design-Vorlage: `apps/mobile/design/pure/invite.html` (Design 2: Tab Toggle). QR-Code ist bewusst die Attrappe aus dem Mockup (User-Entscheidung, App nicht live). Der Remove-Member-Button + Dialog werden als UI gerendert (Mockup-Treue), der Confirm zeigt vorerst einen Toast „Entfernen kommt bald" — der `DELETE`-Command ist **nicht** Teil dieses Plans.
- Token-Entscheidungen (bisher „offen" in `services/events.md:337`): Format = UUID v4 simple (32 Hex-Zeichen), Gültigkeit 7 Tage, **ein** aktiver Token pro Liste (Reuse bei erneutem POST solange gültig), Widerruf bleibt offen. Wird in Task 12 in `events.md` dokumentiert.

---

### Task 1: Domain-Ports `InviteStore` + `UserDirectory` + Memory-Implementierungen

**Files:**
- Modify: `services/domain/src/ports.rs` (Traits anhängen, `Ports`-Struct NICHT anfassen)
- Modify: `services/domain/src/memory.rs` (In-Memory-Implementierungen anhängen)

**Interfaces:**
- Produces: `StoredInvite { token: String, aggregate: AggregateId, expires_at_ms: u64 }`, `trait InviteStore { invite_for, invite_by_token, put_invite }`, `trait UserDirectory { display_name }`, `MemoryInviteStore::new()`, `MemoryUserDirectory::new()` + Builder `with_name(user_id, name)`.

- [ ] **Step 1: Failing Test schreiben** — ans Ende von `memory.rs` ein neues Testmodul (bzw. in das bestehende `#[cfg(test)]`-Modul NEUE Funktionen anhängen, bestehende unberührt):

```rust
#[tokio::test]
async fn an_invite_is_findable_by_aggregate_and_by_token() {
    let invites = MemoryInviteStore::new();
    let invite = StoredInvite {
        token: "tok-1".into(),
        aggregate: AggregateId::list("abc"),
        expires_at_ms: 42,
    };

    invites.put_invite(&invite).await.expect("stores");

    let by_list = invites.invite_for(&AggregateId::list("abc")).await.expect("readable");
    let by_token = invites.invite_by_token("tok-1").await.expect("readable");
    assert_eq!(by_list, Some(invite.clone()));
    assert_eq!(by_token, Some(invite));
}

#[tokio::test]
async fn the_directory_returns_the_stored_name_or_none() {
    let users = MemoryUserDirectory::new().with_name("u1", "Sarah");

    assert_eq!(users.display_name(&UserId("u1".into())).await.expect("ok"), Some("Sarah".into()));
    assert_eq!(users.display_name(&UserId("u2".into())).await.expect("ok"), None);
}
```

- [ ] **Step 2: Rot sehen** — `cargo test -p domain` → Compile-Fehler „cannot find type `MemoryInviteStore`" (erwartete Rot-Ursache: Typen fehlen).
- [ ] **Step 3: Implementieren** — in `ports.rs`:

```rust
/// One active invite of a list. Both lookups (by aggregate for reuse,
/// by token for join) return the same value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredInvite {
    pub token: String,
    pub aggregate: AggregateId,
    pub expires_at_ms: u64,
}

#[async_trait]
pub trait InviteStore: Send + Sync {
    /// The list's current invite, if any (reuse on repeated create).
    async fn invite_for(&self, aggregate: &AggregateId) -> Result<Option<StoredInvite>, StoreError>;
    /// Resolves a token to its invite — the joiner only knows the token.
    async fn invite_by_token(&self, token: &str) -> Result<Option<StoredInvite>, StoreError>;
    /// Stores an invite under both lookups, replacing the list's previous one.
    async fn put_invite(&self, invite: &StoredInvite) -> Result<(), StoreError>;
}

#[async_trait]
pub trait UserDirectory: Send + Sync {
    /// Display name for enriching listMemberAdded; None when unknown.
    async fn display_name(&self, user: &UserId) -> Result<Option<String>, StoreError>;
}
```

In `memory.rs` (Mutex-Stil wie die bestehenden Memory-Ports dort; exakt deren Locking-Muster übernehmen):

```rust
pub struct MemoryInviteStore {
    invites: Mutex<Vec<StoredInvite>>,
}

impl MemoryInviteStore {
    pub fn new() -> Self {
        Self { invites: Mutex::new(Vec::new()) }
    }
}

#[async_trait]
impl InviteStore for MemoryInviteStore {
    async fn invite_for(&self, aggregate: &AggregateId) -> Result<Option<StoredInvite>, StoreError> {
        Ok(self.invites.lock().unwrap().iter().find(|i| i.aggregate == *aggregate).cloned())
    }
    async fn invite_by_token(&self, token: &str) -> Result<Option<StoredInvite>, StoreError> {
        Ok(self.invites.lock().unwrap().iter().find(|i| i.token == token).cloned())
    }
    async fn put_invite(&self, invite: &StoredInvite) -> Result<(), StoreError> {
        let mut invites = self.invites.lock().unwrap();
        invites.retain(|i| i.aggregate != invite.aggregate);
        invites.push(invite.clone());
        Ok(())
    }
}

pub struct MemoryUserDirectory {
    names: HashMap<String, String>,
}

impl MemoryUserDirectory {
    pub fn new() -> Self {
        Self { names: HashMap::new() }
    }
    pub fn with_name(mut self, user_id: &str, name: &str) -> Self {
        self.names.insert(user_id.into(), name.into());
        self
    }
}

#[async_trait]
impl UserDirectory for MemoryUserDirectory {
    async fn display_name(&self, user: &UserId) -> Result<Option<String>, StoreError> {
        Ok(self.names.get(&user.0).cloned())
    }
}
```

Hinweis: `AggregateId` braucht ggf. `PartialEq`/`Clone` — hat es bereits (wird in HashMaps/Vergleichen benutzt); falls `Eq` fehlt, deriven.

- [ ] **Step 4: Grün sehen** — `cargo test -p domain`.
- [ ] **Step 5: Commit** — `git add services/domain && git commit -m "feat(domain): invite store and user directory ports with memory impls"`

---

### Task 2: Use Case `create_invite`

**Files:**
- Create: `services/domain/src/usecases/create_invite.rs`
- Modify: `services/domain/src/usecases/mod.rs` (`pub mod create_invite;`)

**Interfaces:**
- Consumes: `InviteStore`, `MembershipStore`, `check_can_invite`, `StoredInvite` (Task 1).
- Produces: `pub const INVITE_TTL_MS: u64`, `CreateInviteError { NotAllowed(MembershipViolation), Store(StoreError) }`, `CreateInviteRequest { list_id, fresh_token, now_ms }`, `pub async fn create_invite(membership: &dyn MembershipStore, invites: &dyn InviteStore, caller: &UserId, request: CreateInviteRequest) -> Result<StoredInvite, CreateInviteError>`.

- [ ] **Step 1: Failing Tests** (im neuen File unten, Stil wie `create_list.rs`-Tests):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{MemoryInviteStore, MemoryMembershipStore};
    use crate::membership::MembershipViolation;
    use crate::ports::MemberRole;

    fn request(token: &str, now_ms: u64) -> CreateInviteRequest {
        CreateInviteRequest { list_id: "abc".into(), fresh_token: token.into(), now_ms }
    }

    #[tokio::test]
    async fn the_owner_gets_a_token_valid_for_seven_days() {
        let membership = MemoryMembershipStore::new()
            .with_member(&AggregateId::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await;
        let invites = MemoryInviteStore::new();

        let invite = create_invite(&membership, &invites, &UserId("mama".into()), request("tok-1", 1_000))
            .await
            .expect("owner may invite");

        assert_eq!(invite.token, "tok-1");
        assert_eq!(invite.expires_at_ms, 1_000 + INVITE_TTL_MS);
    }

    #[tokio::test]
    async fn a_repeated_create_reuses_the_active_token() {
        let membership = MemoryMembershipStore::new()
            .with_member(&AggregateId::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await;
        let invites = MemoryInviteStore::new();
        create_invite(&membership, &invites, &UserId("mama".into()), request("tok-1", 1_000)).await.expect("first");

        let second = create_invite(&membership, &invites, &UserId("mama".into()), request("tok-2", 2_000))
            .await
            .expect("second");

        assert_eq!(second.token, "tok-1");
    }

    #[tokio::test]
    async fn an_expired_token_is_replaced() {
        let membership = MemoryMembershipStore::new()
            .with_member(&AggregateId::list("abc"), &UserId("mama".into()), MemberRole::Owner)
            .await;
        let invites = MemoryInviteStore::new();
        create_invite(&membership, &invites, &UserId("mama".into()), request("tok-1", 0)).await.expect("first");

        let after_expiry = create_invite(&membership, &invites, &UserId("mama".into()), request("tok-2", INVITE_TTL_MS + 1))
            .await
            .expect("replaces");

        assert_eq!(after_expiry.token, "tok-2");
    }

    #[tokio::test]
    async fn a_plain_member_may_not_invite() {
        let membership = MemoryMembershipStore::new()
            .with_member(&AggregateId::list("abc"), &UserId("tom".into()), MemberRole::Member)
            .await;
        let invites = MemoryInviteStore::new();

        let result = create_invite(&membership, &invites, &UserId("tom".into()), request("tok-1", 0)).await;

        assert!(matches!(result, Err(CreateInviteError::NotAllowed(MembershipViolation::OwnerOnly))));
    }

    #[tokio::test]
    async fn a_stranger_may_not_invite() {
        let membership = MemoryMembershipStore::new();
        let invites = MemoryInviteStore::new();

        let result = create_invite(&membership, &invites, &UserId("eve".into()), request("tok-1", 0)).await;

        assert!(matches!(result, Err(CreateInviteError::NotAllowed(MembershipViolation::NotAMember))));
    }
}
```

- [ ] **Step 2: Rot sehen** — `cargo test -p domain` → Modul existiert nicht.
- [ ] **Step 3: Implementieren:**

```rust
use thiserror::Error;

use crate::event::{AggregateId, UserId};
use crate::membership::{check_can_invite, MembershipViolation};
use crate::ports::{InviteStore, MembershipStore, StoreError, StoredInvite};

/// Invite links are valid for seven days (design/pure/invite.html:
/// "Link gültig für 7 Tage").
pub const INVITE_TTL_MS: u64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Debug, Error)]
pub enum CreateInviteError {
    #[error(transparent)]
    NotAllowed(#[from] MembershipViolation),
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct CreateInviteRequest {
    pub list_id: String,
    /// Generated by the caller (lambda) — the domain stays deterministic.
    pub fresh_token: String,
    pub now_ms: u64,
}

/// Class 2: only the owner mints invite tokens. One active token per
/// list — a repeated create returns the existing one while it is valid,
/// so link and QR stay stable across screen visits.
pub async fn create_invite(
    membership: &dyn MembershipStore,
    invites: &dyn InviteStore,
    caller: &UserId,
    request: CreateInviteRequest,
) -> Result<StoredInvite, CreateInviteError> {
    let aggregate = AggregateId::list(request.list_id);
    let role = membership.role_of(&aggregate, caller).await?;
    check_can_invite(role)?;

    if let Some(existing) = invites.invite_for(&aggregate).await? {
        if existing.expires_at_ms > request.now_ms {
            return Ok(existing);
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
```

- [ ] **Step 4: Grün sehen** — `cargo test -p domain`.
- [ ] **Step 5: Commit** — `feat(domain): create-invite use case (owner-only, 7-day token reuse)`

---

### Task 3: Use Case `join_list`

**Files:**
- Create: `services/domain/src/usecases/join_list.rs`
- Modify: `services/domain/src/usecases/mod.rs`

**Interfaces:**
- Consumes: `Ports` (events/membership/broadcast), `InviteStore`, `UserDirectory` (Task 1).
- Produces: `JoinListError { InvalidToken, Store(StoreError) }`, `JoinListRequest { token, event_id, device_id, now_ms }`, `JoinedList { list_id: String, already_member: bool }`, `pub async fn join_list(ports: &Ports<'_>, invites: &dyn InviteStore, users: &dyn UserDirectory, caller: &UserId, request: JoinListRequest) -> Result<JoinedList, JoinListError>`. Event-Type-Konstante `pub const LIST_MEMBER_ADDED: &str = "lists/listMemberAdded";`.

- [ ] **Step 1: Failing Tests:**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{MemoryEventPublisher, MemoryEventStore, MemoryInviteStore, MemoryMembershipStore, MemoryUserDirectory};
    use crate::ports::{EventStore, MemberRole, MembershipStore, Ports, StoredInvite};
    use serde_json::json;

    async fn valid_invite(invites: &MemoryInviteStore) {
        invites.put_invite(&StoredInvite {
            token: "tok-1".into(),
            aggregate: AggregateId::list("abc"),
            expires_at_ms: 10_000,
        }).await.expect("stored");
    }

    fn request(token: &str, now_ms: u64) -> JoinListRequest {
        JoinListRequest { token: token.into(), event_id: "evt-1".into(), device_id: "device-1".into(), now_ms }
    }

    #[tokio::test]
    async fn a_valid_token_appends_the_member_event_and_grants_membership() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();
        let invites = MemoryInviteStore::new();
        valid_invite(&invites).await;
        let users = MemoryUserDirectory::new().with_name("tom", "Tom");
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let joined = join_list(&ports, &invites, &users, &UserId("tom".into()), request("tok-1", 1_000))
            .await
            .expect("join succeeds");

        assert_eq!(joined.list_id, "abc");
        assert!(!joined.already_member);
        let log = store.events_since(&AggregateId::list("abc"), None).await.expect("readable");
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].event_type, "lists/listMemberAdded");
        assert_eq!(log[0].payload, json!({ "listId": "abc", "memberId": "tom", "name": "Tom" }));
        let role = membership.role_of(&AggregateId::list("abc"), &UserId("tom".into())).await.expect("readable");
        assert_eq!(role, Some(MemberRole::Member));
    }

    #[tokio::test]
    async fn an_unknown_name_falls_back_to_mitglied() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();
        let invites = MemoryInviteStore::new();
        valid_invite(&invites).await;
        let users = MemoryUserDirectory::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        join_list(&ports, &invites, &users, &UserId("tom".into()), request("tok-1", 1_000)).await.expect("joins");

        let log = store.events_since(&AggregateId::list("abc"), None).await.expect("readable");
        assert_eq!(log[0].payload.get("name").and_then(|v| v.as_str()), Some("Mitglied"));
    }

    #[tokio::test]
    async fn an_existing_member_joins_idempotently_without_a_second_event() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new()
            .with_member(&AggregateId::list("abc"), &UserId("tom".into()), MemberRole::Member)
            .await;
        let publisher = MemoryEventPublisher::new();
        let invites = MemoryInviteStore::new();
        valid_invite(&invites).await;
        let users = MemoryUserDirectory::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let joined = join_list(&ports, &invites, &users, &UserId("tom".into()), request("tok-1", 1_000))
            .await
            .expect("idempotent");

        assert!(joined.already_member);
        let log = store.events_since(&AggregateId::list("abc"), None).await.expect("readable");
        assert!(log.is_empty());
    }

    #[tokio::test]
    async fn an_unknown_token_is_rejected() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();
        let invites = MemoryInviteStore::new();
        let users = MemoryUserDirectory::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let result = join_list(&ports, &invites, &users, &UserId("tom".into()), request("nope", 1_000)).await;

        assert!(matches!(result, Err(JoinListError::InvalidToken)));
    }

    #[tokio::test]
    async fn an_expired_token_is_rejected() {
        let store = MemoryEventStore::new();
        let membership = MemoryMembershipStore::new();
        let publisher = MemoryEventPublisher::new();
        let invites = MemoryInviteStore::new();
        valid_invite(&invites).await;
        let users = MemoryUserDirectory::new();
        let ports = Ports { events: &store, membership: &membership, broadcast: &publisher };

        let result = join_list(&ports, &invites, &users, &UserId("tom".into()), request("tok-1", 10_001)).await;

        assert!(matches!(result, Err(JoinListError::InvalidToken)));
        let log = store.events_since(&AggregateId::list("abc"), None).await.expect("readable");
        assert!(log.is_empty());
    }
}
```

- [ ] **Step 2: Rot sehen** — `cargo test -p domain`.
- [ ] **Step 3: Implementieren:**

```rust
use serde_json::json;
use thiserror::Error;

use crate::event::{NewEvent, UserId};
use crate::ports::{InviteStore, MemberRole, Ports, StoreError, UserDirectory};

pub const LIST_MEMBER_ADDED: &str = "lists/listMemberAdded";

#[derive(Debug, Error)]
pub enum JoinListError {
    /// Unknown or expired token — deliberately one error, the caller
    /// cannot tell tokens apart anyway.
    #[error("invalid or expired invite token")]
    InvalidToken,
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug)]
pub struct JoinListRequest {
    pub token: String,
    pub event_id: String,
    pub device_id: String,
    pub now_ms: u64,
}

#[derive(Debug)]
pub struct JoinedList {
    pub list_id: String,
    pub already_member: bool,
}

/// Class 2: the server verifies the token, enriches the display name and
/// writes lists/listMemberAdded itself — the event type is not client-
/// appendable (envelope allowlist rejects it on the generic path).
/// Event first, membership second: if add_member fails the joiner retries
/// and the event append dedups on event_id.
pub async fn join_list(
    ports: &Ports<'_>,
    invites: &dyn InviteStore,
    users: &dyn UserDirectory,
    caller: &UserId,
    request: JoinListRequest,
) -> Result<JoinedList, JoinListError> {
    let invite = invites
        .invite_by_token(&request.token)
        .await?
        .ok_or(JoinListError::InvalidToken)?;
    if invite.expires_at_ms <= request.now_ms {
        return Err(JoinListError::InvalidToken);
    }
    let aggregate = invite.aggregate;

    if ports.membership.role_of(&aggregate, caller).await?.is_some() {
        return Ok(JoinedList { list_id: aggregate.id, already_member: true });
    }

    let name = users
        .display_name(caller)
        .await?
        .unwrap_or_else(|| "Mitglied".into());

    let stored = ports
        .events
        .append(
            &aggregate,
            NewEvent {
                event_type: LIST_MEMBER_ADDED.into(),
                payload: json!({ "listId": aggregate.id, "memberId": caller.0, "name": name }),
                event_id: request.event_id,
                device_id: request.device_id,
                user_id: caller.clone(),
            },
        )
        .await?;

    ports.membership.add_member(&aggregate, caller, MemberRole::Member).await?;
    let _ = ports.broadcast.publish(&aggregate.channel(), &stored).await;

    Ok(JoinedList { list_id: aggregate.id, already_member: false })
}
```

Hinweis: Falls `aggregate.id` nach dem `role_of`-Borrow Moves verursacht, `let list_id = aggregate.id.clone()` am Anfang ziehen.

- [ ] **Step 4: Grün sehen** — `cargo test -p domain` (alle, auch Bestand).
- [ ] **Step 5: Commit** — `feat(domain): join-list use case writes listMemberAdded server-side`

---

### Task 4: DynamoDB-Invite-Store + Cognito-UserDirectory-Adapter

**Files:**
- Create: `services/adapters/src/dynamodb_invites.rs`
- Create: `services/adapters/src/cognito_user_directory.rs`
- Modify: `services/adapters/src/lib.rs` (Re-Exports), `services/adapters/Cargo.toml` (`aws-sdk-cognitoidentityprovider = "1"`)

**Interfaces:**
- Produces: `DynamoDbInviteStore::new(client: Client, table_name: String)` (implementiert `InviteStore`, nutzt die **Membership-Tabelle**), `CognitoUserDirectory::new(client: aws_sdk_cognitoidentityprovider::Client, user_pool_id: String)` (implementiert `UserDirectory`).

Storage-Layout (Membership-Tabelle, `pk`/`sk`):
- Listen-Seite: `pk = "LIST#<listId>"`, `sk = "INVITE"`, Attrs `token` (S), `expiresAt` (N). Bewusst ohne `userId`-Attribut → bleibt aus dem `byUser`-GSI raus.
- Token-Seite: `pk = "INVITE#<token>"`, `sk = "INVITE"`, Attrs `listId` (S), `expiresAt` (N).
- `put_invite`: ein `transact_write_items` mit beiden Puts (Listen-Seite überschreibt den alten Token; der alte Token-Seiten-Eintrag bleibt als Leiche liegen und läuft über `expiresAt`-Prüfung im Use Case aus — bewusst simpel, kein TTL nötig).

- [ ] **Step 1: Test** — reine Rust-Unit-Tests ohne AWS sind hier nur für die Item-Mapping-Helfer möglich; wie im bestehenden `dynamodb_membership.rs` (nur `distinct_lists` getestet) beschränken wir uns auf einen Mapping-Helfer-Test:

```rust
// in dynamodb_invites.rs
fn invite_from_items(token: String, list_id: String, expires_at: Option<&str>) -> Option<StoredInvite> {
    let expires_at_ms = expires_at?.parse().ok()?;
    Some(StoredInvite { token, aggregate: AggregateId::list(list_id), expires_at_ms })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_malformed_expiry_yields_no_invite() {
        assert_eq!(invite_from_items("t".into(), "l".into(), Some("not-a-number")), None);
        assert_eq!(invite_from_items("t".into(), "l".into(), None), None);
    }

    #[test]
    fn a_wellformed_item_maps_to_the_invite() {
        let invite = invite_from_items("tok".into(), "abc".into(), Some("42")).expect("maps");
        assert_eq!(invite.expires_at_ms, 42);
    }
}
```

- [ ] **Step 2: Rot sehen** — `cargo test -p adapters`.
- [ ] **Step 3: Implementieren** — `DynamoDbInviteStore` nach dem Muster von `dynamodb_membership.rs` (gleiche Fehler-Mappings `StoreError(error.to_string())`):

```rust
const INVITE_SK: &str = "INVITE";
const INVITE_PK_PREFIX: &str = "INVITE#";

// invite_for: GetItem(pk = aggregate.partition_key(), sk = INVITE_SK)
//   → invite_from_items(token_attr, aggregate.id, expiresAt_attr)
// invite_by_token: GetItem(pk = format!("{INVITE_PK_PREFIX}{token}"), sk = INVITE_SK)
//   → listId-Attribut lesen, dann invite_from_items(token, list_id, expiresAt)
// put_invite: transact_write_items mit zwei Put-Items (siehe Layout oben),
//   Builder-Muster wie claim_ownership, ohne condition_expression.
```

`CognitoUserDirectory`: Lookup per `list_users` mit Filter, weil der Cognito-**Username** nicht die `sub` ist:

```rust
use aws_sdk_cognitoidentityprovider::Client;
use async_trait::async_trait;
use domain::event::UserId;
use domain::ports::{StoreError, UserDirectory};

pub struct CognitoUserDirectory {
    client: Client,
    user_pool_id: String,
}

impl CognitoUserDirectory {
    pub fn new(client: Client, user_pool_id: String) -> Self {
        Self { client, user_pool_id }
    }
}

#[async_trait]
impl UserDirectory for CognitoUserDirectory {
    async fn display_name(&self, user: &UserId) -> Result<Option<String>, StoreError> {
        let response = self.client
            .list_users()
            .user_pool_id(&self.user_pool_id)
            .filter(format!("sub = \"{}\"", user.0))
            .limit(1)
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;
        let name = response.users()
            .first()
            .and_then(|u| u.attributes())
            .iter().flat_map(|attrs| attrs.iter())
            .find(|attr| attr.name() == "name")
            .and_then(|attr| attr.value().map(String::from));
        Ok(name)
    }
}
```

(Exakte SDK-Accessor-Namen — `users()`, `attributes()` — beim Implementieren gegen die SDK-Version prüfen; die Struktur `ListUsers → UserType.Attributes[{Name,Value}]` ist stabil.)

- [ ] **Step 4: Grün + Build** — `cargo test -p adapters && cargo build -p adapters`.
- [ ] **Step 5: Commit** — `feat(adapters): dynamodb invite store and cognito user directory`

---

### Task 5: Lambdas `create-invite` und `join-list`

**Files:**
- Create: `services/lambdas/create-invite/Cargo.toml`, `services/lambdas/create-invite/src/main.rs`
- Create: `services/lambdas/join-list/Cargo.toml`, `services/lambdas/join-list/src/main.rs`

**Interfaces:**
- Consumes: Use Cases aus Task 2/3, Adapter aus Task 4, `lib::auth::extract_user_id`, `lib::wire`, `lib::response::json`, `ApiError`.
- Produces: HTTP-Verträge: `POST /lists/{listId}/invites` → `201 { "token": "...", "expiresAt": <ms> }`; `POST /lists/join` mit Body `{ "payload": { "token": "..." }, "meta": { "eventId": "...", "deviceId": "..." } }` → `200 { "listId": "..." }` (auch bei already_member); Fehler: 403 (kein Owner/Mitglied), 400 (ungültiger/abgelaufener Token).

- [ ] **Step 1: Cargo.toml** — Kopie von `create-list/Cargo.toml` mit angepasstem `name`; `create-invite` zusätzlich `uuid = { version = "1", features = ["v4"] }`; `join-list` zusätzlich `aws-sdk-cognitoidentityprovider = "1"`.
- [ ] **Step 2: `create-invite/src/main.rs`** (Muster = `create-list/main.rs`, gleiche Tracing-Init):

```rust
use adapters::DynamoDbInviteStore;
use aws_sdk_dynamodb::Client;
use domain::adapters_prelude_or_direct_paths::*; // real: use domain::event::UserId; use domain::usecases::create_invite::{create_invite, CreateInviteError, CreateInviteRequest};
use adapters::DynamoDbMembershipStore;
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use lib::error::ApiError;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

// POST /lists/{listId}/invites — class-2 command: only the owner mints
// the invite token; repeated calls return the active token unchanged.
#[tokio::main]
async fn main() -> Result<(), Error> {
    // tracing init exactly like create-list …
    let config = aws_config::load_from_env().await;
    let client = Client::new(&config);
    let membership = DynamoDbMembershipStore::new(client.clone(), std::env::var("MEMBERSHIP_TABLE")?);
    let invites = DynamoDbInviteStore::new(client, std::env::var("MEMBERSHIP_TABLE")?);
    let membership = &membership;
    let invites = &invites;
    run(service_fn(move |http_request: Request| async move {
        handle(membership, invites, http_request).await
    }))
    .await
}

async fn handle(
    membership: &DynamoDbMembershipStore,
    invites: &DynamoDbInviteStore,
    http_request: Request,
) -> Result<Response<Body>, Error> {
    let caller = match lib::auth::extract_user_id(&http_request) {
        Ok(user_id) => UserId(user_id),
        Err(api_error) => return api_error.to_response(),
    };
    let list_id = match http_request.path_parameters().first("listId").map(String::from) {
        Some(list_id) => list_id,
        None => return ApiError::BadRequest("listId is required".into()).to_response(),
    };
    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    let request = CreateInviteRequest {
        list_id,
        fresh_token: uuid::Uuid::new_v4().simple().to_string(),
        now_ms,
    };

    match create_invite(membership, invites, &caller, request).await {
        Ok(invite) => lib::response::json(201, &json!({ "token": invite.token, "expiresAt": invite.expires_at_ms })),
        Err(CreateInviteError::NotAllowed(violation)) => ApiError::Forbidden(violation.to_string()).to_response(),
        Err(CreateInviteError::Store(store_error)) => {
            tracing::error!(error = %store_error, "create invite failed");
            ApiError::Internal.to_response()
        }
    }
}
```

(Die Import-Zeile mit `adapters_prelude_or_direct_paths` ist Pseudocode-Marker im Plan — real die direkten `use`-Pfade wie im Codeblock-Kommentar angegeben verwenden. `as u64`-Cast ist hier die dokumentierte Ausnahme; alternativ `u64::try_from(d.as_millis()).unwrap_or(u64::MAX)` — nimm die try_from-Variante, das Projekt vermeidet Casts.)

- [ ] **Step 3: `join-list/src/main.rs`** — gleiches Gerüst; Ports komplett verdrahtet wie `create-list` (events + membership + NoopEventPublisher), zusätzlich `DynamoDbInviteStore` + `CognitoUserDirectory::new(aws_sdk_cognitoidentityprovider::Client::new(&config), std::env::var("USER_POOL_ID")?)`. Body-Parsing:

```rust
fn parse_request(body: &[u8], now_ms: u64) -> Result<JoinListRequest, ApiError> {
    let action = lib::wire::parse_action(body)?;
    let payload = lib::wire::required_payload(&action)?;
    let token = payload.get("token").and_then(serde_json::Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("payload.token is required".into()))?
        .to_string();
    Ok(JoinListRequest {
        token,
        event_id: lib::wire::required_meta_field(&action, "eventId")?,
        device_id: lib::wire::required_meta_field(&action, "deviceId")?,
        now_ms,
    })
}
```

Fehler-Mapping: `JoinListError::InvalidToken` → `ApiError::BadRequest("invalid or expired invite token".into())`, `Store` → `Internal`. Erfolg → `lib::response::json(200, &json!({ "listId": joined.list_id }))`.

- [ ] **Step 4: Bauen** — `cargo build` (Workspace-Root `services/`); Workspace-Glob `lambdas/*` nimmt die neuen Crates automatisch auf.
- [ ] **Step 5: Commit** — `feat(lambdas): create-invite and join-list endpoints`

---

### Task 6: CDK-Verdrahtung

**Files:**
- Modify: `apps/infrastructure/lib/ShopZebraApiStack.ts`

**Interfaces:**
- Produces: Routen `POST /lists/{listId}/invites` und `POST /lists/join`, beide mit dem bestehenden `authorizer`; Env `USER_POOL_ID` (= `eu-central-1_z6PK2KOsC`, aus dem bestehenden `COGNITO_ISSUER` ableitbar) im shared `lambdaEnvironment`; IAM `cognito-idp:ListUsers` für die Join-Lambda.

- [ ] **Step 1:** Zwei `RustFunction`s nach exakt dem `create-list`-Muster (`shopzebra-create-invite` / `shopzebra-join-list`, `manifestPath` auf `lambdas/create-invite` bzw. `lambdas/join-list`, `...rustFunctionResources`). Grants: `membershipTable.grantReadWriteData(...)` für beide; zusätzlich `eventsTable.grantReadWriteData(joinListFunction)`. IAM für Cognito:

```ts
joinListFunction.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['cognito-idp:ListUsers'],
    resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${COGNITO_USER_POOL_ID}`],
  }),
)
```

(`COGNITO_USER_POOL_ID` als neue Konstante neben `COGNITO_ISSUER`; `import * as iam from 'aws-cdk-lib/aws-iam'` ergänzen.) `USER_POOL_ID` ins geteilte `lambdaEnvironment`-Objekt.

- [ ] **Step 2:** Routen:

```ts
httpApi.addRoutes({
  path: '/lists/{listId}/invites',
  methods: [apigwv2.HttpMethod.POST],
  integration: new apigwv2_integrations.HttpLambdaIntegration('CreateInviteIntegration', createInviteFunction),
  authorizer,
})
httpApi.addRoutes({
  path: '/lists/join',
  methods: [apigwv2.HttpMethod.POST],
  integration: new apigwv2_integrations.HttpLambdaIntegration('JoinListIntegration', joinListFunction),
  authorizer,
})
```

- [ ] **Step 3: Verifizieren** — in `apps/infrastructure/`: `pnpm test` (bestehende Stack-Tests prüfen JWT-Auth + Memory/Timeout automatisch mit) und `pnpm cdk synth --quiet` (bundelt die Rust-Crates — Pflicht laut Memory-Feedback).
- [ ] **Step 4: Commit** — `feat(infra): wire create-invite and join-list lambdas`

---

### Task 7: `listMemberAdded` im lists-Slice

**Files:**
- Modify: `apps/mobile/src/features/lists/domain/listsDomain.ts`
- Modify: `apps/mobile/src/features/lists/domain/listsSlice.ts`
- Test (neu): `apps/mobile/test/features/lists/domain/listsSlice.members.test.ts`

**Interfaces:**
- Produces: `ShoppingList` erhält `readonly memberNames?: Readonly<Record<string, string>>` (**optional** — bestehende Tests und persistierte Blobs bleiben gültig). Neue Action `listMemberAdded` (Wire-Type `lists/listMemberAdded`, Payload `{ listId, memberId, name }` — identisch zum Server-Event, kein Wire-Mapping nötig). Neuer Selector `selectListMembers(state, listId): readonly { id: string; name: string | null; isOwner: boolean }[]`.

- [ ] **Step 1: Failing Tests** (neue Datei, Stil der bestehenden Slice-Tests):

```ts
import { describe, expect, it } from 'vitest'
import { listCreated, listMemberAdded, listsReducer, selectListMembers } from '@/features/lists/domain/listsSlice'

const meta = { eventId: 'e1', deviceId: 'd1' }

function createdList() {
  return listsReducer(undefined, listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'mama' }, meta))
}

describe('listMemberAdded', () => {
  it('adds the member with display name to the list', () => {
    const state = listsReducer(
      createdList(),
      listMemberAdded({ listId: 'l1', memberId: 'tom', name: 'Tom' }, meta),
    )

    const members = selectListMembers({ lists: state }, 'l1')
    expect(members).toEqual([
      { id: 'mama', name: null, isOwner: true },
      { id: 'tom', name: 'Tom', isOwner: false },
    ])
  })

  it('folds the same member twice without duplicating (totality)', () => {
    const once = listsReducer(createdList(), listMemberAdded({ listId: 'l1', memberId: 'tom', name: 'Tom' }, meta))
    const twice = listsReducer(once, listMemberAdded({ listId: 'l1', memberId: 'tom', name: 'Tom' }, meta))

    expect(selectListMembers({ lists: twice }, 'l1')).toHaveLength(2)
  })

  it('ignores the event for an unknown list (totality)', () => {
    const state = listsReducer(createdList(), listMemberAdded({ listId: 'other', memberId: 'tom', name: 'Tom' }, meta))

    expect(selectListMembers({ lists: state }, 'other')).toEqual([])
  })
})
```

(Signatur des Action-Creators — zweites `meta`-Argument — an den bestehenden Slice-Tests ausrichten; wenn die bestehenden Tests Actions ohne meta dispatchen, hier genauso.)

- [ ] **Step 2: Rot sehen** — `pnpm exec vitest run test/features/lists/domain/listsSlice.members.test.ts`.
- [ ] **Step 3: Implementieren** — `listsDomain.ts`: Feld `readonly memberNames?: Readonly<Record<string, string>>` mit JSDoc `/** Display names from listMemberAdded, keyed by memberId. The owner has no entry — listCreated carries no name. */`. Im Slice:

```ts
listMemberAdded: (
  state: ListsState,
  action: PayloadAction<{
    readonly listId: string
    readonly memberId: string
    readonly name: string
  }>,
): ListsState => ({
  ...state,
  lists: state.lists.map((list) =>
    list.id === action.payload.listId
      ? {
          ...list,
          memberIds: list.memberIds.includes(action.payload.memberId)
            ? list.memberIds
            : [...list.memberIds, action.payload.memberId],
          memberNames: {
            ...list.memberNames,
            [action.payload.memberId]: action.payload.name,
          },
        }
      : list,
  ),
}),
```

Selector (im Slice, nicht in der Komponente):

```ts
export const selectListMembers = (
  state: StateWithLists,
  listId: string,
): readonly { readonly id: string; readonly name: string | null; readonly isOwner: boolean }[] => {
  const list = state.lists.lists.find((candidate) => candidate.id === listId)
  if (!list) return []
  return list.memberIds.map((id) => ({
    id,
    name: list.memberNames?.[id] ?? null,
    isOwner: id === list.ownerId,
  }))
}
```

Export von `listMemberAdded` bei den Actions ergänzen.

- [ ] **Step 4: Grün + Gesamtsuite** — `pnpm exec tsc --noEmit && pnpm exec vitest run` (bestehende Slice-/Totality-Tests müssen unverändert grün sein).
- [ ] **Step 5: Commit** — `feat(lists): fold listMemberAdded into the lists slice`

---

### Task 8: Frontend-Commands `fetchListInvite` + `joinListByToken`

**Files:**
- Create: `apps/mobile/src/features/lists/members/inviteCommands.ts`
- Test (neu): `apps/mobile/test/features/lists/members/inviteCommands.test.ts`

**Interfaces:**
- Produces: `type ListInvite = { readonly token: string; readonly expiresAt: number }`, `fetchListInvite(listId, fetcher?): Promise<ListInvite>`, `joinListByToken(token, meta, fetcher?): Promise<{ readonly listId: string }>` mit `meta: { readonly eventId: string; readonly deviceId: string }`. Beide werfen `Error` mit Statuscode-Text bei !ok (Loader fangen das). Fetcher-Injection wie in `fetchEvents.ts` (`fetcher: Fetcher = authFetch`).

- [ ] **Step 1: Failing Tests** — Fake-Fetcher wie in den Sync-Tests:

```ts
import { describe, expect, it } from 'vitest'
import { fetchListInvite, joinListByToken } from '@/features/lists/members/inviteCommands'

function fakeFetcher(status: number, body: unknown) {
  const calls: { path: string; init?: RequestInit }[] = []
  const fetcher = (path: string, init?: RequestInit) => {
    calls.push({ path, init })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
  return { fetcher, calls }
}

describe('invite commands', () => {
  it('fetches the invite token for a list', async () => {
    const { fetcher, calls } = fakeFetcher(201, { token: 'tok-1', expiresAt: 42 })

    const invite = await fetchListInvite('l1', fetcher)

    expect(calls[0].path).toBe('/lists/l1/invites')
    expect(calls[0].init?.method).toBe('POST')
    expect(invite).toEqual({ token: 'tok-1', expiresAt: 42 })
  })

  it('joins with token and action-shaped body', async () => {
    const { fetcher, calls } = fakeFetcher(200, { listId: 'l1' })

    const joined = await joinListByToken('tok-1', { eventId: 'e1', deviceId: 'd1' }, fetcher)

    expect(calls[0].path).toBe('/lists/join')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toEqual({ payload: { token: 'tok-1' }, meta: { eventId: 'e1', deviceId: 'd1' } })
    expect(joined).toEqual({ listId: 'l1' })
  })

  it('rejects on a 400 join', async () => {
    const { fetcher } = fakeFetcher(400, { error: 'invalid or expired invite token' })

    await expect(joinListByToken('bad', { eventId: 'e1', deviceId: 'd1' }, fetcher)).rejects.toThrow('400')
  })
})
```

- [ ] **Step 2: Rot sehen.**
- [ ] **Step 3: Implementieren:**

```ts
// Class-2 commands of the members feature. Both need the server response
// BEFORE anything can be shown/dispatched — the documented exception to
// the outbox path (like auth thunks), not an offline-capable event.

import { authFetch, type Fetcher } from '../../../app/authFetch'

export type ListInvite = {
  readonly token: string
  readonly expiresAt: number
}

/** Owner-only. Returns the list's active invite token (server reuses it). */
export async function fetchListInvite(
  listId: string,
  fetcher: Fetcher = authFetch,
): Promise<ListInvite> {
  const response = await fetcher(`/lists/${listId}/invites`, { method: 'POST' })
  if (!response.ok) throw new Error(`POST /lists/${listId}/invites → ${response.status}`)
  const body: unknown = await response.json()
  const { token, expiresAt } = body as { readonly token?: unknown; readonly expiresAt?: unknown }
  if (typeof token !== 'string' || typeof expiresAt !== 'number') {
    throw new Error('invite response is malformed')
  }
  return { token, expiresAt }
}

/** Redeems an invite token; the server writes lists/listMemberAdded. */
export async function joinListByToken(
  token: string,
  meta: { readonly eventId: string; readonly deviceId: string },
  fetcher: Fetcher = authFetch,
): Promise<{ readonly listId: string }> {
  const response = await fetcher('/lists/join', {
    method: 'POST',
    body: JSON.stringify({ payload: { token }, meta }),
  })
  if (!response.ok) throw new Error(`POST /lists/join → ${response.status}`)
  const body: unknown = await response.json()
  const { listId } = body as { readonly listId?: unknown }
  if (typeof listId !== 'string') throw new Error('join response is malformed')
  return { listId }
}
```

- [ ] **Step 4: Grün sehen.**
- [ ] **Step 5: Commit** — `feat(lists): invite/join commands against the backend`

---

### Task 9: MembersPage nach Mockup (Segmented Control, Mitglieder-Tab, Einladen-Tab mit QR-Attrappe)

**Files:**
- Create: `apps/mobile/src/features/lists/members/MembersPage.tsx`
- Create: `apps/mobile/src/features/lists/members/QrCodeDummy.tsx`
- Modify: `apps/mobile/src/app/router.ts` (Route `/lists/$listId/members` mit Loader)
- Modify: `apps/mobile/src/app/RootLayout.tsx` (Members-Route ohne BottomNav)

**Interfaces:**
- Consumes: `selectListMembers`, `selectListById` (Task 7), `fetchListInvite` (Task 8), Auth-User-Selector (derselbe, den `CreateListPage` für `owner.userId` benutzt — in `features/auth/domain/authSlice.ts` nachschlagen).
- Produces: Route `/lists/$listId/members`; Loader-Rückgabe `{ invite: ListInvite | null }` (null für Nicht-Owner). `QrCodeDummy` = das 11×11-Muster aus `invite.html` (`generateQR()`-Array 1:1 übernehmen), 160px weiße Kachel.

Verhalten (aus `design/pure/invite.html`, 1:1):
- Header: Zurück-Button (→ `/lists`), Titel „Mitglieder", 70px-Spacer — exakt das `ProfilePage`-Header-Muster.
- Segmented Control „Mitglieder (Badge: n) | Einladen" — Umsetzung mit zwei Buttons im `ToggleGroup`-Stil (`data-[state=on]`-Muster aus `ListEditor`); aktiver Tab ist **ephemerer UI-State** (`useState` erlaubt).
- Mitglieder-Tab: Karte pro Mitglied — 44px-Avatar-Kreis (Farbe via bestehendem `memberAvatarColor(memberId)` + Initial aus `name ?? id`), Name (eigener Eintrag: „Du"-Logik → Rolle-Zeile „Admin · Du" beim Owner-Selbst, sonst „Mitglied"; Name-Fallback wenn `name === null`: bei sich selbst der Auth-Name, sonst „Mitglied"), Remove-Button (✕, danger-Stil) → öffnet `AlertDialog` („<Name> entfernen?" / „… hat dann keinen Zugriff mehr auf diese Einkaufsliste." / Abbrechen | Entfernen); **Entfernen zeigt vorerst Toast „Entfernen kommt bald"** (Attrappe, siehe Global Constraints). Kein Remove-Button auf der eigenen Karte (Mockup: Sarah hat keinen). Unten: Invite-CTA-Karte („Neues Mitglied einladen" / „Per QR-Code, Link, WhatsApp oder E-Mail") → wechselt auf den Einladen-Tab.
- Einladen-Tab (nur wenn `invite !== null`, sonst Tab ausgeblendet — Owner-only laut Domain-Modell; bewusste, zu dokumentierende Abweichung vom Mockup): `QrCodeDummy` + „QR-Code scannen" / „oder Einladungslink teilen"; Link-Feld mit `${window.location.origin}/join/${invite.token}` + Copy-Button (`navigator.clipboard.writeText`, Häkchen-Feedback 2s, Toast „Link kopiert"); Zeile „Link gültig für 7 Tage"; Share-Sektion „EINLADUNG SENDEN" mit „Per WhatsApp" (`window.open('https://wa.me/?text=' + encodeURIComponent(text))`) und „Per E-Mail" (`window.location.href = 'mailto:?subject=...&body=' + encodeURIComponent(text)`), Einladungstext: `Komm in meine Einkaufsliste "<name>" bei ShopZebra: <link>`.
- Toast: lokale Komponente im File (fixed bottom, success-Stil des Mockups), ephemerer `useState`.

- [ ] **Step 1: Route + Loader** in `router.ts` (Muster `editListRoute`):

```ts
const listMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/members',
  beforeLoad: requireAuth,
  loader: async ({ params }) => {
    const state = store.getState()
    const list = selectListById(state, params.listId)
    const me = /* Auth-User-Selector, wie in CreateListPage */
    if (!list || !me || list.ownerId !== me.userId) return { invite: null }
    try {
      return { invite: await fetchListInvite(params.listId) }
    } catch {
      return { invite: null }
    }
  },
  component: () => {
    const { listId } = listMembersRoute.useParams()
    const { invite } = listMembersRoute.useLoaderData()
    return MembersPage({ listId, invite })
  },
})
```

Route in `rootRoute.addChildren([...])` ergänzen. In `RootLayout.tsx` die BottomNav-Bedingung erweitern: zusätzlich zu den exakten `FULLSCREEN_ROUTES` auch `pathname.endsWith('/members')` bzw. sauberer ein Prädikat `isFullscreen(pathname)` das die bestehende Liste + `/members`-Suffix + `/join/`-Präfix prüft (Join-Route kommt in Task 10).
- [ ] **Step 2: Komponente bauen** — Struktur wie oben; Styling-Konventionen aus `ProfilePage.tsx` (Header, Section-Labels, `bg-card`-Karten, `text-teal`), Danger-Ton `#E07B7B`-Analogon über bestehende `destructive`-Tokens. `QrCodeDummy`: 121er-Pattern-Array aus `invite.html:715-727` kopieren, Grid via CSS `grid-template-columns: repeat(11, 1fr)`, dunkle Zellen `#1a1a2e`, Container weiß 160px, `rounded-[20px]`.
- [ ] **Step 3: Verifizieren** — `pnpm exec tsc --noEmit && pnpm exec vitest run`; dann manuell im Browser (`pnpm dev`): Als Owner Members-Page öffnen → beide Tabs, Copy zeigt Toast, WhatsApp/E-Mail öffnen sich mit Link, QR-Attrappe sichtbar; als Nicht-Owner: nur Mitglieder-Tab.
- [ ] **Step 4: Commit** — `feat(lists): members page with invite tab (link, share, qr dummy)`

---

### Task 10: Join-Route `/join/$token`

**Files:**
- Create: `apps/mobile/src/features/lists/join/JoinListPage.tsx`
- Modify: `apps/mobile/src/app/router.ts`

**Interfaces:**
- Consumes: `joinListByToken` (Task 8), `syncEngine.requestSync()` (public), `store.getState().app.deviceId`.
- Produces: Route `/join/$token` (requireAuth). Loader: join ausführen → bei Erfolg `await syncEngine.requestSync()` (holt die neue Liste + deren Log) → `throw redirect({ to: '/lists/$listId', params: { listId } })`. Bei Fehler Rückgabe `{ error: true }` → `JoinListPage` zeigt „Dieser Einladungslink ist ungültig oder abgelaufen." + Button „Zu meinen Listen" (→ `/lists`).

- [ ] **Step 1: Route + Loader:**

```ts
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/join/$token',
  beforeLoad: requireAuth,
  loader: async ({ params }) => {
    const meta = {
      eventId: crypto.randomUUID(),
      deviceId: store.getState().app.deviceId,
    }
    try {
      const { listId } = await joinListByToken(params.token, meta)
      await syncEngine.requestSync()
      throw redirect({ to: '/lists/$listId', params: { listId } })
    } catch (error) {
      if (isRedirect(error)) throw error
      return { error: true }
    }
  },
  component: JoinListPage,
})
```

(`isRedirect` aus `@tanstack/react-router` — Redirects dürfen nicht vom catch verschluckt werden. `deviceId`-Quelle = dieselbe wie `eventIdMiddleware` (`state.app.deviceId`).)
- [ ] **Step 2: `JoinListPage`** — zentrierte Fehlermeldung im `EditListPage`-„nicht gefunden"-Stil + `Button` → `/lists`.
- [ ] **Step 3: Verifizieren** — tsc + vitest; manuell: Owner kopiert Link, Inkognito-Fenster (zweiter User) öffnet ihn → landet auf der Liste, Members-Page beider Fenster zeigt das neue Mitglied (Owner-Fenster nach Fokus-Wechsel oder eigener Aktion — Sync-Zyklus).
- [ ] **Step 4: Commit** — `feat(lists): join route redeems invite links`

---

### Task 11: Einstiegspunkt auf die Members-Page

**Files:**
- Modify: `apps/mobile/src/features/lists/manage/EditListPage.tsx` (bzw. laut Review-Entscheid ein anderer Ort — siehe Handoff-Frage)

**Interfaces:**
- Consumes: Route aus Task 9.

- [ ] **Step 1:** In `EditListPage` unter dem `ListEditor` (oder als Row im Editor-Layout passend zum `ProfilePage`-Row-Muster) eine Zeile „Mitglieder" mit Mitglieder-Anzahl (`selectListMembers(...).length`) und Chevron, `onClick` → `navigate({ to: '/lists/$listId/members', params: { listId } })`.
- [ ] **Step 2:** tsc + vitest + manueller Klickpfad: Listen-Übersicht → Liste bearbeiten → Mitglieder.
- [ ] **Step 3: Commit** — `feat(lists): members entry point from list edit`

---

### Task 12: Doku nachziehen

**Files:**
- Modify: `services/events.md` (Zeile ~337: Token-Format/Ablauf-Entscheidung eintragen: UUIDv4-simple, 7 Tage, ein aktiver Token pro Liste mit Reuse, Widerruf weiter offen; App-Links weiter offen)
- Modify: `architecture/status.md` (§1-Tabelle Backend-Endpunkte 4→6; neuer Absatz „Membership/Invites (2026-07-31)": beide Commands, Members-Page, Join-Route, listMemberAdded-Fold; bekannte Grenzen: Owner-Name fehlt in der Anzeige für Joiner (listCreated trägt keinen Namen), Remove-Member nur UI-Attrappe, Deep-Links/App-Links offen, `/join` verliert Redirect-Ziel beim Sign-in-Redirect)
- Modify: `apps/mobile/src/app/sync/README.md` (Invariante ergänzen: zweiter Klasse-2-Fall existiert serverseitig — `listMemberAdded` kommt nur per Catch-up, nie durch die Outbox)

- [ ] **Step 1:** Die drei Docs editieren (Inhalte wie oben spezifiziert).
- [ ] **Step 2: Commit** — `docs: record invite/member feature state and token decisions`

---

## Bekannte, bewusst akzeptierte Grenzen (im Review bestätigen)

1. **Owner-Name für Joiner unbekannt** — `listCreated` trägt keinen Namen; Owner-Karte zeigt beim Joiner „Mitglied"-Fallback bzw. Initial aus der ID. Sauberer Fix (späteres Feature): Owner-Name in `GET /lists` oder eigenes Event.
2. **Remove-Member ist Attrappe** (UI + Dialog da, Confirm → Toast). Eigener Folge-Plan (`DELETE /lists/{listId}/members/{memberId}` + `listMemberRemoved`-Fold).
3. **QR ist Attrappe** (User-Entscheidung; App nicht live).
4. **Kein natives Deep-Linking** — der Link funktioniert nur im Browser/WebView derselben Origin; App Links/AASA bleiben offen (events.md).
5. **`requireAuth` verliert das Join-Ziel** — öffnet ein ausgeloggter User den Link, landet er nach Sign-in auf `/profile`, nicht auf `/join/$token`. Akzeptiert für Schritt 1 (Test-Szenario: beide User eingeloggt).
6. **Invite-Tab nur für Owner sichtbar** — Abweichung vom Mockup (das kennt keine Rollen), erzwungen durch das Owner-Modell.
