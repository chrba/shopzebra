# Client-geprägte Identität Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Gerät prägt seine Nutzer-Id beim ersten Start; sie ist der Cognito-Username des Schattenkontos und die Id, die der Server aus dem JWT liest. Der Platzhalter `local-user` und die gesamte Docking-/Rewrite-Maschinerie entfallen.

**Architecture:** Backend liest `claims["username"]` statt `sub` und löst Namen per `AdminGetUser`. Client: `deviceIdentity.ts` prägt/persistiert `shopzebra_user_id`; `authSlice` kennt `local | guest | linked`, alle mit `userId`; `ensureShadowAccount(username, name?)` legt das Konto unter genau dieser Id an; `ensureIdentity` schrumpft auf „Konto anlegen → guest → startSync". Danach werden `authorRewrite.ts`, `rewrittenMembership.ts`, `pendingAuthorRewritten`, `identityAttached`, `Outbox.rewriteAuthor`, `SyncEngine.rewriteQueuedAuthor` gelöscht.

**Tech Stack:** Rust (lambda_http, aws-sdk-cognitoidentityprovider), CDK/TypeScript, React/Redux mit eigenem `createSlice`, Amplify Auth, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-client-minted-identity-design.md`

> **Nachtrag (nach dem Whole-Branch-Review, 2026-09-05):** Task 2 wurde so ausgeführt, wie unten beschrieben (`deviceIdentity.ts`, `shopzebra_user_id`, `ensureShadowAccount(username, name?)`). Der Review fand ein Loch: Ein bei Cognito erfolgreicher `signUp`, dessen Credentials nicht gespeichert wurden, hätte den festen Username dauerhaft blockiert. Die Fix-Welle hat deshalb `deviceIdentity.ts` in `shadowAccount.ts` aufgelöst — **ein** Blob `shopzebra_shadow_credentials { username, password, accountCreated }`, beim ersten Start geprägt; `ensureShadowAccount(name?)` meldet sich erst an und legt das Konto nur bei `UserNotFoundException` an; `restoreShadowSession()` meldet sich am Boot nur an, wenn `accountCreated` gesetzt ist. Der Zielzustand steht in der Spec; dieser Plan bleibt als Ausführungsprotokoll stehen.

## Global Constraints

- Frontend-Kommandos in `apps/mobile`: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec prettier --write <files>`. Backend in `services`: `cargo test`. Infrastruktur in `apps/infrastructure`: `pnpm exec cdk synth` (cargo-lambda bundelt dabei den Workspace — Pflicht nach jeder Backend-Änderung).
- **Keine Commits** — der Nutzer entscheidet am Ende.
- Kein `any`, kein `as` außer bestehenden Test-Fixtures. `readonly`, `const`. Kommentare Englisch, Aussage zuerst, keine Datei-Verweise in Kommentaren.
- **Test-Policy — Freigabe durch den Nutzer nötig für:** Ändern: `test/features/auth/domain/authSlice.identity.test.ts`, `test/features/auth/domain/ensureIdentity.test.ts`. Löschen: `test/app/sync/rewriteQueuedAuthor.test.ts`, `test/features/lists/domain/listsSlice.identityAttached.test.ts`. Keine weiteren Tests ändern; bricht ein anderer, STOPP.
- Nichts ist live, es gibt keine Daten — keine Migration, keine Abwärtskompatibilität.
- Reihenfolge Task 1 → 2 → 3 → 4. Nach Task 2 sind `pnpm test`/`tsc` grün (Docking existiert noch, wird nur nicht mehr aufgerufen); Task 3 löscht.

---

### Task 1: Backend liest den Username, löst Namen per `AdminGetUser`

**Files:**
- Modify: `services/lib/src/auth.rs`
- Modify: `services/adapters/src/cognito_user_directory.rs`
- Modify: `apps/infrastructure/lib/ShopZebraApiStack.ts` (Policy-Block ~Zeile 163–172)
- Modify: `services/events.md` (~Zeile 379)

**Interfaces:** `extract_user_id` und `UserDirectory::display_name` behalten Signatur und Semantik; nur die Quelle der Id ändert sich.

- [ ] **Step 1: `auth.rs` — Claim wechseln**

Über `pub fn extract_user_id` einen Doc-Kommentar setzen und den Claim tauschen:

```rust
/// The caller's user id: the Cognito username of the access token. The
/// client mints it as a UUID at first start and signs the shadow account up
/// under it, so every event ever written carries the same author the JWT
/// proves. `sub` would be a second id for the same person.
pub fn extract_user_id(request: &Request) -> Result<String, ApiError> {
```

und `.and_then(|jwt| jwt.claims.get("sub"))` → `.and_then(|jwt| jwt.claims.get("username"))`.

- [ ] **Step 2: `cognito_user_directory.rs` — `admin_get_user`**

Datei-Doc und `display_name` ersetzen:

```rust
/// Resolves display names from the Cognito user pool. The user id IS the
/// pool username, so one `admin_get_user` answers; a user that is gone
/// (deleted account) resolves to None like a user without a name.
pub struct CognitoUserDirectory {
```

```rust
#[async_trait]
impl UserDirectory for CognitoUserDirectory {
    async fn display_name(&self, user_id: &UserId) -> Result<Option<String>, StoreError> {
        let response = match self
            .client
            .admin_get_user()
            .user_pool_id(&self.user_pool_id)
            .username(&user_id.0)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) if error.as_service_error().is_some_and(|e| e.is_user_not_found_exception()) => {
                return Ok(None)
            }
            Err(error) => return Err(StoreError(error.to_string())),
        };

        let name = response
            .user_attributes()
            .iter()
            .find(|attribute| attribute.name() == "name")
            .and_then(|attribute| attribute.value())
            .map(str::to_string)
            .filter(|name| !name.is_empty());

        Ok(name)
    }
}
```

(Falls `as_service_error()`/`is_user_not_found_exception()` in der eingesetzten SDK-Version anders heißen, die SDK-Doku der Crate-Version in `Cargo.lock` konsultieren — Semantik: *UserNotFound → Ok(None), alles andere → Err*.)

- [ ] **Step 3: CDK-Policy und Kommentar**

In `ShopZebraApiStack.ts` den Block

```ts
    // The joiner's and the owner's display names come from the user pool —
    // the access token carries only `sub`, so names have to be looked up.
    const listUsersPolicy = new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers'],
```

ersetzen durch

```ts
    // Display names live in the user pool, keyed by username — which is the
    // user id the client minted, so one AdminGetUser per name.
    const readUserPolicy = new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
```

und die vier `addToRolePolicy(listUsersPolicy)` → `addToRolePolicy(readUserPolicy)`.

- [ ] **Step 4: `services/events.md`**

Den Satz `Der Server liest den Anzeigenamen per `cognito-idp:ListUsers` (Filter auf `sub`) aus dem User Pool` → `Der Server liest den Anzeigenamen per `cognito-idp:AdminGetUser` aus dem User Pool — die Nutzer-Id ist der Cognito-Username`.

- [ ] **Step 5: Prüfen**

Run (in `services`): `cargo test` — Expected: grün (Domain-Tests nutzen opake Ids; der Adapter hat keine Unit-Tests).
Run (in `apps/infrastructure`): `pnpm exec cdk synth` — Expected: grün, Template enthält `cognito-idp:AdminGetUser` und kein `ListUsers` mehr (`grep -c ListUsers cdk.out/*.template.json` → 0).

---

### Task 2: Client — Id am ersten Start, Konto unter dieser Id, kein Rewrite-Aufruf mehr

**Files:**
- Create: `apps/mobile/src/features/auth/domain/deviceIdentity.ts`; Delete: `apps/mobile/src/features/auth/domain/localUser.ts`
- Modify: `apps/mobile/src/features/auth/domain/authSlice.ts`
- Modify: `apps/mobile/src/features/auth/domain/shadowAccount.ts`
- Modify: `apps/mobile/src/features/auth/domain/identityThunks.ts`
- Modify: `apps/mobile/src/features/auth/domain/authThunks.ts`
- Modify: `apps/mobile/src/app/router.ts`
- Modify: `apps/mobile/src/app/sync/startSync.ts` (nur `selectHasIdentity` → `selectHasAccount`)
- Modify (Tests, freigegeben): `test/features/auth/domain/authSlice.identity.test.ts`, `test/features/auth/domain/ensureIdentity.test.ts`

**Interfaces:**
- Produces: `ensureUserId(): Promise<string>`, `forgetUserId(): Promise<void>`; `Identity = local | guest | linked` (alle mit `userId`); Actions `deviceIdentified({ userId, name })` (ersetzt `deviceNamed`), `identityCleared({ userId })`; Selektor `selectHasAccount` (ersetzt `selectHasIdentity`); `ensureShadowAccount(username: string, name?: string): Promise<void>`.
- Nach diesem Task ruft niemand mehr `rewriteQueuedAuthor`/`identityAttached`/`pendingAuthorRewritten` auf — sie existieren nur noch tot bis Task 3.

- [ ] **Step 1: Tests umschreiben (schlagen dann fehl)**

`authSlice.identity.test.ts` — Import `LOCAL_USER_ID` streichen, `deviceNamed` nicht nötig; Imports: `deviceIdentified`, `guestIdentityCreated`, `identityLinked`, `displayNameChanged`, `identityCleared`, `selectIdentity`, `selectHasAccount`, `selectIsGuest`, `selectDisplayName`, `selectCurrentUserId`. Die Tests:

```ts
describe('identity', () => {
  test('starts local — the device has an id, nobody owes an account', () => {
    const auth = fold([deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' })])
    expect(selectHasAccount({ auth })).toBe(false)
    expect(selectIsGuest({ auth })).toBe(false)
    expect(selectCurrentUserId({ auth })).toBe('dev-1')
    expect(selectDisplayName({ auth })).toBe('Naschzebra')
  })

  // The account is created under the id the device already had.
  test('becomes a guest with the same id when the shadow account exists', () => {
    const auth = fold([
      deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' }),
      guestIdentityCreated({ userId: 'dev-1', name: 'Chris' }),
    ])
    expect(selectHasAccount({ auth })).toBe(true)
    expect(selectIsGuest({ auth })).toBe(true)
    expect(selectDisplayName({ auth })).toBe('Chris')
    expect(selectCurrentUserId({ auth })).toBe('dev-1')
  })

  // Linking must not mint a new identity — the userId is the whole point.
  test('linking keeps the userId and stops being a guest', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      identityLinked({ email: 'chris@example.com', provider: 'email' }),
    ])
    expect(selectIsGuest({ auth })).toBe(false)
    expect(selectIdentity({ auth })).toMatchObject({ kind: 'linked', userId: 'u1' })
  })

  test('renaming works in every state', () => {
    const auth = fold([
      deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' }),
      displayNameChanged({ name: 'Christian' }),
    ])
    expect(selectDisplayName({ auth })).toBe('Christian')
  })

  // Signing out ends the account; the device goes on under a fresh id, or
  // the next share would collide with the username that just left.
  test('clearing returns to local under a new id, keeping the name', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      identityCleared({ userId: 'dev-2' }),
    ])
    expect(selectHasAccount({ auth })).toBe(false)
    expect(selectCurrentUserId({ auth })).toBe('dev-2')
    expect(selectDisplayName({ auth })).toBe('Chris')
  })
})
```

`ensureIdentity.test.ts` — Mock ohne `rewriteQueuedAuthor` (`syncEngine: { offer: vi.fn() }`), `ensureShadowAccount: vi.fn(() => Promise.resolve())`; `beforeEach` dispatcht `identityCleared({ userId: 'dev-1' })` und `deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' })`. Die Tests:

```ts
  // The account appears at the first share, under the id the device has had
  // since its first start — nothing to rewrite, nothing to order.
  test('creates the account under the device id, then starts syncing', async () => {
    await store.dispatch(ensureIdentity())

    expect(ensureShadowAccount).toHaveBeenCalledWith('dev-1', 'Naschzebra')
    expect(selectIsGuest(store.getState())).toBe(true)
    expect(selectCurrentUserId(store.getState())).toBe('dev-1')
    expect(startSync).toHaveBeenCalledTimes(1)
  })

  // What the guest wrote already names the id the account gets.
  test('the lists written before the account already belong to it', async () => {
    store.dispatch(listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'dev-1' }))

    await store.dispatch(ensureIdentity())

    expect(selectListById(store.getState(), 'l1')?.ownerId).toBe('dev-1')
  })

  test('is idempotent — a second call creates no second account', async () => {
    await store.dispatch(ensureIdentity())
    await store.dispatch(ensureIdentity())
    expect(ensureShadowAccount).toHaveBeenCalledTimes(1)
  })
```

Run: `pnpm vitest run test/features/auth/domain/authSlice.identity.test.ts test/features/auth/domain/ensureIdentity.test.ts` — Expected: FAIL (Exports fehlen).

- [ ] **Step 2: `deviceIdentity.ts` anlegen, `localUser.ts` löschen**

```ts
// Who this device is — a UUID minted once at the first start and kept for
// good. It becomes the Cognito username of the shadow account, so the id the
// server later proves from the JWT is the one every event already carries.

import { getItem, removeItem, setItem } from '../../../app/clientStorage'

const USER_ID_KEY = 'shopzebra_user_id'

/**
 * The stored user id, or a freshly minted one on the very first start.
 * Called once per boot, before the identity is restored.
 */
export async function ensureUserId(): Promise<string> {
  const stored = await getItem(USER_ID_KEY)
  if (stored !== null && stored !== '') return stored

  const minted = crypto.randomUUID()
  await setItem(USER_ID_KEY, minted)
  return minted
}

/**
 * Drops the id so the next call to ensureUserId mints a new one. Called on
 * sign-out: the account takes its id along, and the next share on this
 * device must not sign up under a username that already exists.
 */
export async function forgetUserId(): Promise<void> {
  await removeItem(USER_ID_KEY)
}
```

`git rm apps/mobile/src/features/auth/domain/localUser.ts`.

- [ ] **Step 3: `authSlice.ts`**

Import `LOCAL_USER_ID` entfernen. `Identity`-Doc und Typ:

```ts
/**
 * Who this device is, in three states. `local`: the id is minted, no account
 * exists — everything stays on the device. `guest`: the shadow account
 * exists under that same id. `linked`: an email or a social account was
 * attached to the same Cognito user. The userId never changes across the
 * three — the account is created under it, linking upgrades the account.
 *
 * A name exists in every state, drawn at the very first start.
 */
export type Identity =
  | { readonly kind: 'local'; readonly userId: string; readonly name: string }
  | { readonly kind: 'guest'; readonly userId: string; readonly name: string }
  | {
      readonly kind: 'linked'
      readonly userId: string
      readonly name: string
      readonly email: string | null
      readonly provider: AuthProvider
    }

/** An identity with an account behind it — what may talk to the server. */
export type EstablishedIdentity = Exclude<Identity, { readonly kind: 'local' }>
```

`initialState`: `identity: { kind: 'local', userId: '', name: '' }` mit Kommentar `// Empty only until the boot hands id and name over.`

Reducer `deviceNamed` ersetzen durch:

```ts
    /**
     * Who this device is: id and name, both minted at the first start and
     * restored from storage on every later one. Dispatched before the
     * identity is restored, so an account Cognito knows still wins.
     */
    deviceIdentified: (
      state: AuthState,
      action: PayloadAction<{ readonly userId: string; readonly name: string }>,
    ): AuthState => ({
      ...state,
      identity: { kind: 'local', userId: action.payload.userId, name: action.payload.name },
    }),
```

`identityLinked`: Bedingung `state.identity.kind === 'none'` → `state.identity.kind === 'local'`. `displayNameChanged`: die Bedingung `state.identity.kind === 'none' ? state : …` entfällt — der Name gilt in jedem Zustand:

```ts
    displayNameChanged: (
      state: AuthState,
      action: PayloadAction<{ readonly name: string }>,
    ): AuthState => ({
      ...state,
      identity: { ...state.identity, name: action.payload.name },
    }),
```

`identityAttached` **löschen** (Reducer und Export). `identityCleared`:

```ts
    // Signing out ends the account, not the device — the name stays, the id
    // is fresh: the old one belongs to the account that just left.
    identityCleared: (
      state: AuthState,
      action: PayloadAction<{ readonly userId: string }>,
    ): AuthState => ({
      ...state,
      identity: { kind: 'local', userId: action.payload.userId, name: state.identity.name },
    }),
```

Exporte: `deviceIdentified` statt `deviceNamed`, `identityAttached` raus. Selektoren:

```ts
/** True once a Cognito account exists — the binary sync rule reads this. */
export const selectHasAccount = (state: StateWithAuth): boolean =>
  state.auth.identity.kind !== 'local'

/** The author of everything this device writes — the same id in every state. */
export const selectCurrentUserId = (state: StateWithAuth): string =>
  state.auth.identity.userId
```

(`selectHasIdentity` entfällt; `selectIsGuest`, `selectDisplayName`, `selectIdentity` unverändert.)

- [ ] **Step 4: `shadowAccount.ts`**

`generateShadowCredentials()` wird zu `shadowCredentialsFor(username: string): ShadowCredentials` → `{ username, password: randomPassword() }`. `ensureShadowAccount`:

```ts
/**
 * Signs the device in as `username`, creating the shadow account on first
 * use. Called at the first share or join with the device's own user id, and
 * again at boot when the token cache is gone but the credentials are here.
 *
 * The display name is written to the Cognito `name` attribute: the server
 * reads it when it writes listMemberAdded, and a shadow account has no
 * other source.
 */
export async function ensureShadowAccount(username: string, name?: string): Promise<void> {
  const existing = await loadShadowCredentials()
  const credentials = existing ?? shadowCredentialsFor(username)
  const displayName = name?.trim() ?? ''

  if (existing === null) {
    await signUp({
      username: credentials.username,
      password: credentials.password,
      ...(displayName === '' ? {} : { options: { userAttributes: { name: displayName } } }),
    })
    // Persisted only after Cognito accepted them: "credentials stored"
    // means "account exists" — the boot relies on that.
    await setItem(SHADOW_CREDENTIALS_KEY, JSON.stringify(credentials))
  }

  await signIn({ username: credentials.username, password: credentials.password })

  if (displayName !== '' && existing !== null) {
    await updateUserAttributes({ userAttributes: { name: displayName } })
  }
}
```

`getCurrentUser`-Import entfernen. Der bestehende Test `shadowAccount.test.ts` ruft `generateShadowCredentials()` — **dieser Test ist nicht freigegeben**; deshalb `generateShadowCredentials` als Ein-Zeilen-Wrapper behalten: `export function generateShadowCredentials(): ShadowCredentials { return shadowCredentialsFor(crypto.randomUUID()) }` mit Doc `/** Credentials for a throwaway username — kept for the password tests. */`. (Kann in einem späteren Pass mit Freigabe entfallen.)

- [ ] **Step 5: `identityThunks.ts`**

```ts
// Identity thunks. Auth is not optimistic: the guest identity only exists
// after Cognito confirms it, which is why these are thunks and not events.

import type { AppDispatch, RootState } from '../../../app/store'
import { startSync } from '../../../app/sync/startSync'
import { ensureShadowAccount } from './shadowAccount'
import {
  guestIdentityCreated,
  selectCurrentUserId,
  selectDisplayName,
  selectHasAccount,
} from './authSlice'

/**
 * Turns a purely local device into one the server knows: creates the shadow
 * account under the id the device has had since its first start, then lets
 * the sync engine off the leash. Called at the first share or join — never
 * with a question to the user, because the device has had a name since its
 * first start. Nothing is rewritten: every event already names this id.
 */
export const ensureIdentity =
  () =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    if (selectHasAccount(getState())) return

    const userId = selectCurrentUserId(getState())
    const name = selectDisplayName(getState())
    await ensureShadowAccount(userId, name)
    dispatch(guestIdentityCreated({ userId, name }))

    // Only now is there something to sync with — the queued events flush.
    startSync()
  }
```

- [ ] **Step 6: `authThunks.ts`**

Import `forgetUserId, ensureUserId` aus `./deviceIdentity`; `selectHasIdentity` → `selectHasAccount` (Import und Verwendung ~Zeile 101). In `performSignOut` nach `await removeItem(SHADOW_CREDENTIALS_KEY)`:

```ts
    // The id leaves with the account; the device goes on under a fresh one.
    await forgetUserId()
    const userId = await ensureUserId()
```

und `dispatch(identityCleared())` → `dispatch(identityCleared({ userId }))`.

- [ ] **Step 7: `router.ts`**

Imports: `deviceIdentified` statt `deviceNamed`; `ensureUserId` aus `../features/auth/domain/deviceIdentity`; `selectHasIdentity` → `selectHasAccount` (Import und `canReachServer`). Boot-Schritt 1:

```ts
    // 1. Who this device is — id and name, minted on the very first start,
    //    kept ever after. Before the identity, so an account Cognito already
    //    knows still wins.
    store.dispatch(
      deviceIdentified({ userId: await ensureUserId(), name: await ensureDeviceName() }),
    )
```

`identityOfSession`: `restoredIdentity(cognitoUser.userId, …)` → `restoredIdentity(cognitoUser.username, …)`. `identityOfStoredCredentials`:

```ts
async function identityOfStoredCredentials(): Promise<EstablishedIdentity | null> {
  const credentials = await loadShadowCredentials()
  if (credentials === null) return null
  try {
    await ensureShadowAccount(credentials.username)
    return await identityOfSession()
  } catch (error: unknown) {
```

- [ ] **Step 8: `startSync.ts`**

`selectHasIdentity` → `selectHasAccount` (Import + Verwendung).

- [ ] **Step 9: Prüfen**

Run: `grep -rn "selectHasIdentity\|deviceNamed\|LOCAL_USER_ID\|localUser'" src test` — Expected: leer.
Run: `pnpm vitest run test/features/auth` — Expected: grün.
Run: `pnpm test`, `pnpm exec tsc --noEmit` — Expected: grün / sauber. (Die Docking-Tests laufen noch — sie testen Funktionen, die es bis Task 3 noch gibt.)
Run: `pnpm exec prettier --write` auf allen geänderten Dateien dieses Tasks.

---

### Task 3: Docking-Maschinerie löschen

**Files:**
- Delete: `apps/mobile/src/app/sync/authorRewrite.ts`, `apps/mobile/src/features/sharing/rewrittenMembership.ts`
- Modify: `apps/mobile/src/app/sync/outbox.ts` (Methode `rewriteAuthor` + Import), `apps/mobile/src/app/sync/syncEngine.ts` (`rewriteQueuedAuthor` + Import), `apps/mobile/src/app/sync/withSync.ts` (`PENDING_AUTHOR_REWRITTEN`, Typ, Creator, Guard, Reducer-Zweig, Import)
- Modify: `apps/mobile/src/features/lists/domain/listsSlice.ts`, `recipes/domain/recipesSlice.ts`, `shopping/domain/shoppingSlice.ts` (`extraReducers`-Eintrag `identityAttached` + Imports)
- Modify: `apps/mobile/src/features/lists/domain/listsClientStorageHandler.ts`, `shopping/domain/shoppingClientStorageHandler.ts`, `recipes/domain/recipesClientStorageHandler.ts` (Bedingung `!identityAttached.match(action) &&` + Import; Kommentar „Docking rewrites the confirmed tree in place …" streichen bzw. auf den Rest kürzen)
- Delete (Tests, freigegeben): `test/app/sync/rewriteQueuedAuthor.test.ts`, `test/features/lists/domain/listsSlice.identityAttached.test.ts`

- [ ] **Step 1: Löschen**

```bash
git rm apps/mobile/src/app/sync/authorRewrite.ts apps/mobile/src/features/sharing/rewrittenMembership.ts apps/mobile/test/app/sync/rewriteQueuedAuthor.test.ts apps/mobile/test/features/lists/domain/listsSlice.identityAttached.test.ts
```

- [ ] **Step 2: `withSync.ts`**

Den Block von `const PENDING_AUTHOR_REWRITTEN = 'sync/pendingAuthorRewritten'` bis einschließlich `isPendingAuthorRewritten` entfernen, ebenso den Zweig `if (isPendingAuthorRewritten(action)) { … }` im Reducer und den Import `withRewrittenAuthorFields`. Falls ein Kopf- oder Blockkommentar „four protocol actions" o.ä. zählt, auf drei korrigieren (`eventsConfirmed`, `pendingRestored`, `pendingDiscarded`).

- [ ] **Step 3: `outbox.ts`, `syncEngine.ts`**

`Outbox.rewriteAuthor` samt Doc entfernen, Import `withRewrittenAuthor` raus. `SyncEngine.rewriteQueuedAuthor` samt Doc entfernen, Import raus.

- [ ] **Step 4: Slices und Storage-Handler**

In allen drei Slices den `extraReducers`-Eintrag mit `creator: identityAttached` löschen; Imports `identityAttached` (und in lists/recipes `withRewrittenMembership`) entfernen. Bleibt ein `extraReducers: []` leer, das Array entfernen.
In den drei Storage-Handlern `!identityAttached.match(action) &&` und den Import streichen; den Kommentar so kürzen, dass er nur noch die verbleibenden Bedingungen erklärt (`listDropped` etc.).

- [ ] **Step 5: Prüfen**

Run: `grep -rn "identityAttached\|pendingAuthorRewritten\|rewriteQueuedAuthor\|rewriteAuthor\|withRewrittenAuthor\|withRewrittenMembership\|AUTHOR_FIELDS\|local-user" src test` — Expected: leer.
Run: `pnpm test`, `pnpm exec tsc --noEmit` — grün / sauber.
Run: `pnpm exec prettier --write` auf den geänderten Dateien.

---

### Task 4: Doku

**Files:**
- Modify: `architecture/accountless-first-planned.md`
- Modify: `architecture/status.md` (§1 Tabelle „Auth", §2 M1-Absatz)
- Modify: `apps/mobile/src/app/sync/README.md` (falls `pendingAuthorRewritten`/`identityAttached`/Docking irgendwo genannt — `grep` zuerst)

- [ ] **Step 1: `accountless-first-planned.md`**

Im Abschnitt „Richtung: Schattenkonto" den Punkt `JWT, Authorizer, `sub`, Backend: alles unverändert` → `JWT und Authorizer unverändert; das Backend liest den Username-Claim — die Nutzer-Id ist die UUID, die das Gerät beim ersten Start prägt und als Cognito-Username verwendet`. Im Abschnitt „Umsetzung in drei Meilensteinen", M1: `lokale Urheberschaft (Sentinel-UserId, beim ersten Teilen auf die echte `sub` umgeschrieben)` → `Urheberschaft von Anfang an unter der geräteeigenen Id (seit 2026-09-05; bis dahin Sentinel + Rewrite)`. Im „Status"-Abschnitt den zweiten Bullet („Die Pending-Queue des Reducers muss beim Andocken mitwandern …") ersetzen durch:

> - **Docking ist Geschichte (2026-09-05).** Die Id wird beim ersten Start geprägt und ist der Cognito-Username; der Server liest `username` statt `sub`. Damit entfällt die Umschreibung an drei Orten (Outbox, Bäume, Pending) samt `pendingAuthorRewritten` und `identityAttached`. Der Bug, den der alte Absatz beschrieb, kann nicht mehr entstehen. Design: `docs/superpowers/specs/2026-09-05-client-minted-identity-design.md`.

- [ ] **Step 2: `status.md`**

§2, Bullet „Identität ist ein Summentyp `none | guest | linked`" → `local | guest | linked` mit Nachsatz: `— alle drei tragen die `userId`, die das Gerät beim ersten Start prägt (`deviceIdentity.ts`); `selectCurrentUserId` hat eine Bedeutung`. Bullet „Schattenkonto …": `Username = UUID` → `Username = die geräteeigene Nutzer-Id`; den Satz mit `sub` streichen, falls vorhanden. Bullet „**Andocken:** …" komplett ersetzen durch `- **Kein Andocken mehr (2026-09-05):** Weil die Id vor dem Konto existiert und dessen Username ist, tragen alle Events von Anfang an den Autor, den das JWT beweist. Der Server liest `username` statt `sub`.` Datums-Header auf `2026-09-05`.

- [ ] **Step 3: README prüfen**

`grep -n -i "pendingAuthorRewritten\|identityAttached\|docking\|rewrite" apps/mobile/src/app/sync/README.md` — jede Fundstelle entfernen oder anpassen; Protokoll-Actions-Liste = `eventsConfirmed`, `pendingRestored`, `pendingDiscarded`.

- [ ] **Step 4: Schlussprüfung**

Run (`apps/mobile`): `pnpm test`, `pnpm exec tsc --noEmit`. Run (`services`): `cargo test`. Run (`apps/infrastructure`): `pnpm exec cdk synth`.
Run: `grep -rn "local-user\|LOCAL_USER_ID\|Sentinel" apps/mobile/src architecture/status.md` — Expected: leer.

---

## Nach Abschluss

- Alle Änderungen bleiben uncommitted; der Nutzer entscheidet über Schnitt und Commit.
- Offen (nicht Teil dieses Plans): `shadowAccount.test.ts` testet noch `generateShadowCredentials`; mit Freigabe kann der Wrapper entfallen und der Test auf `shadowCredentialsFor` umgestellt werden.
