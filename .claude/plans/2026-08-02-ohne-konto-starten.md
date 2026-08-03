# „Ohne Konto starten" — Implementierungsplan Meilenstein 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App ist ohne Registrierung sofort und vollständig nutzbar; beim ersten Teilen oder Beitreten entsteht unsichtbar ein Cognito-Schattenkonto, und ab da synct alles.

**Architecture:** Vor jeder Server-Identität schreibt das Gerät seine Events unter einer lokalen Sentinel-UserId; beim Anlegen des Schattenkontos werden Outbox und State einmalig auf die echte `sub` umgeschrieben („Andocken"). Bis dahin gibt es keinen Server-Kontakt — die Outbox ist das lokale Event-Log; sobald eine Identität existiert, synct alles (binäre Regel), erzwungen an genau einer Stelle: `startSync()`.

**Tech Stack:** React 19 + TanStack Router + Redux (eigenes `createSlice`), aws-amplify 6, Capacitor 7, Rust-Lambdas (hexagonal), AWS CDK, Vitest.

## Umfang: NUR Meilenstein 1 (Entscheidung 2026-08-02)

**Implementiert wird ausschließlich M1 (Tasks 1–10).** M2 (Sichern/Verknüpfen) und M3 (Zweitgerät) sind unten unter [„Vermerkt für später"](#vermerkt-für-später-m2-und-m3--hier-nicht-implementieren) festgehalten — inklusive der Review-Findings, die sie betreffen — und werden **nicht** in diesem Durchlauf gebaut.

Dieser Plan arbeitet die Findings des Plan-Reviews vom 2026-08-02 ein: lokale Urheberschaft vor der Identität (A), Identitäts-Restore beim Boot (B), Join als Gast (G), benannter `authReducer`-Export (F), `env.d.ts` (M), Test-Isolation (N). Die M2/M3-Findings (C, D, E, H, I, J, K, O) stehen im Vermerk-Teil.

## Global Constraints

- **Grundlage:** `architecture/accountless-first-planned.md` und `spikes/cognito-shadow-account/findings.md`. Bei Widerspruch gewinnen diese Dokumente.
- **Bestehende Tests werden NICHT geändert.** Würde eine Änderung einen bestehenden Test brechen: STOPPEN, melden, auf Entscheidung warten. Neue Tests sind erwünscht. Konkret bekannt: `joinIntentSlice.test.ts` pinnt den Join-Intent-Mechanismus — er wird deshalb **nicht gelöscht**, nur nicht mehr angesteuert.
- **Commits nur auf ausdrückliche Ansage.**
- **Die Sync-Engine-Läufe (`syncEngine.ts`, `drainOutbox.ts`, `catchUp.ts`, `withSync.ts`) werden nicht angefasst.** Einzige erlaubte Erweiterung: eine **additive** Migrationsfunktion in `outbox.ts` (Task 4) — sie läuft einmalig vor dem ersten Engine-Start, nie im Sync-Zyklus.
- **Reducer bleiben replay-pur:** kein `Date.now()`, `crypto.randomUUID()`, `Math.random()` in Reducern.
- **Kein `any`, kein `as`-Casting, `const` statt `let`, `readonly` auf Properties, `type` statt `interface`. Kommentare auf Englisch. Kein `localStorage` direkt.**
- **Eine Lambda pro Route.** Fachlogik in `services/domain/`.
- **Design-Treue:** Screen 1A exakt nach `apps/mobile/design/pure/accountless/share-name.html`.
- Region `eu-central-1`, AWS-Profil `shopzebra`.

## Dateien im Überblick (M1)

| Datei | Verantwortung |
|---|---|
| `services/lambdas/pre-signup/` | Cognito-Trigger: bestätigt jeden Sign-up automatisch (ohne E-Mail gibt es keinen Code) |
| `apps/infrastructure/lib/ShopZebraUserPool.ts` | Neuer User Pool + App-Client als eigenes Construct |
| `apps/mobile/src/features/auth/domain/localUser.ts` | Die lokale Sentinel-Identität vor dem ersten Konto |
| `apps/mobile/src/features/auth/domain/shadowAccount.ts` | Erzeugen, Speichern, Anmelden des Schattenkontos |
| `apps/mobile/src/features/auth/domain/authSlice.ts` | Identität als Summentyp `none \| guest \| linked` + Selektoren |
| `apps/mobile/src/features/auth/domain/identityThunks.ts` | `ensureIdentity` — Konto anlegen, andocken, Sync starten |
| `apps/mobile/src/features/auth/domain/restoredIdentity.ts` | Boot: Amplify-Session → `guest`/`linked` ableiten |
| `apps/mobile/src/app/sync/outbox.ts` | + `rewriteQueuedAuthor` (additive Andock-Migration) |
| `apps/mobile/src/app/sync/startSync.ts` | Torwächter der binären Regel |
| `apps/mobile/src/features/sharing/FirstShareNameSheet.tsx` | Screen 1A — beim Einladen **und** beim Beitreten |

---

### Task 1: Neuer User Pool mit Auto-Confirm-Trigger (CDK)

Der heutige Pool hat `UsernameAttributes: ["email"]` und ist damit unveränderlich ungeeignet (Spike-Befund). Der neue Pool kommt als eigenes Construct in CDK.

**Files:**
- Create: `services/lambdas/pre-signup/Cargo.toml`, `services/lambdas/pre-signup/src/main.rs`
- Create: `apps/infrastructure/lib/ShopZebraUserPool.ts`
- Modify: `apps/infrastructure/lib/ShopZebraApiStack.ts` (Konstanten oben + Authorizer)
- Test: `apps/infrastructure/test/ShopZebraUserPool.test.ts`

**Interfaces:**
- Produces: `ShopZebraUserPool` mit den Readonly-Feldern `userPool: cognito.UserPool`, `userPoolClient: cognito.UserPoolClient`, `issuer: string`, `domainPrefix: string`

- [ ] **Step 1: PreSignUp-Lambda schreiben**

`services/lambdas/pre-signup/Cargo.toml` (Dependency-Versionen an ein bestehendes Lambda-Crate wie `services/lambdas/create-list/Cargo.toml` angleichen):

```toml
[package]
name = "pre-signup"
version = "0.1.0"
edition = "2021"

[dependencies]
lambda_runtime = "0.13"
serde_json = "1"
tokio = { version = "1", features = ["macros"] }
```

`services/lambdas/pre-signup/src/main.rs`:

```rust
use lambda_runtime::{service_fn, Error, LambdaEvent};
use serde_json::Value;

/// Cognito pre-signup trigger. Auto-confirms every user: a shadow account
/// signs up without an email address, so there is no confirmation code to
/// deliver. Called by Cognito on every SignUp before the user is created.
async fn handler(event: LambdaEvent<Value>) -> Result<Value, Error> {
    let (mut payload, _context) = event.into_parts();
    payload["response"]["autoConfirmUser"] = Value::Bool(true);
    Ok(payload)
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    lambda_runtime::run(service_fn(handler)).await
}
```

- [ ] **Step 2: Workspace-Build prüfen**

Run: `cd services && cargo build -p pre-signup`
Expected: kompiliert (Workspace-Glob `lambdas/*`).

- [ ] **Step 3: CDK-Test schreiben (schlägt fehl)**

`apps/infrastructure/test/ShopZebraUserPool.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { ShopZebraUserPool } from '../lib/ShopZebraUserPool'

function synth(): Template {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack', {
    env: { account: '111111111111', region: 'eu-central-1' },
  })
  new ShopZebraUserPool(stack, 'UserPool')
  return Template.fromStack(stack)
}

describe('shadow-account user pool', () => {
  // Without these two settings a shadow account is impossible: email must
  // stay optional, and it must be usable as a sign-in alias later.
  test('email is an alias, not the username', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPool', {
      AliasAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
    })
  })

  test('no attribute is required for sign-up', () => {
    const pool = Object.values(
      synth().findResources('AWS::Cognito::UserPool'),
    )[0]
    const required = (pool.Properties.Schema ?? []).filter(
      (attribute: { Required?: boolean }) => attribute.Required === true,
    )
    expect(required).toEqual([])
  })

  test('a pre-signup trigger auto-confirms users', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: { PreSignUp: Match.anyValue() },
    })
  })
})
```

- [ ] **Step 4: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/infrastructure && pnpm test ShopZebraUserPool`
Expected: FAIL, `Cannot find module '../lib/ShopZebraUserPool'`

- [ ] **Step 5: Construct schreiben**

`apps/infrastructure/lib/ShopZebraUserPool.ts`:

```typescript
import * as cdk from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as path from 'path'
import { Construct } from 'constructs'
import { RustFunction } from 'cargo-lambda-cdk'

const SERVICES_DIR = path.join(__dirname, '..', '..', '..', 'services')

/**
 * The user pool that makes shadow accounts possible. Both decisive
 * settings — email as an alias and no required attributes — are
 * immutable after creation, which is why the old pool could not be
 * reused (see spikes/cognito-shadow-account/findings.md).
 */
export class ShopZebraUserPool extends Construct {
  readonly userPool: cognito.UserPool
  readonly userPoolClient: cognito.UserPoolClient
  readonly issuer: string
  readonly domainPrefix: string

  constructor(scope: Construct, id: string) {
    super(scope, id)

    const preSignUp = new RustFunction(this, 'PreSignUpFunction', {
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'pre-signup'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
    })

    this.userPool = new cognito.UserPool(this, 'Pool', {
      userPoolName: 'shopzebra',
      selfSignUpEnabled: true,
      signInAliases: { username: true, email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: false, mutable: true } },
      lambdaTriggers: { preSignUp },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.domainPrefix = `shopzebra-${cdk.Stack.of(this).account}`
    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: this.domainPrefix },
    })

    this.userPoolClient = this.userPool.addClient('AppClient', {
      authFlows: { userPassword: true },
      generateSecret: false,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    })

    this.issuer = `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`
  }
}
```

Google/Apple-IdPs kommen erst mit M2 — `supportedIdentityProviders` bleibt bei `COGNITO`.

- [ ] **Step 6: Test laufen lassen — muss grün sein**

Run: `cd apps/infrastructure && pnpm test ShopZebraUserPool`
Expected: PASS (3 Tests)

- [ ] **Step 7: Stack auf den neuen Pool umhängen**

In `ShopZebraApiStack.ts` die drei Konstanten (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_ISSUER`) löschen und ersetzen:

```typescript
const identity = new ShopZebraUserPool(this, 'Identity')

// lambdaEnvironment: USER_POOL_ID: identity.userPool.userPoolId

const authorizer = new apigwv2_authorizers.HttpJwtAuthorizer(
  'CognitoAuthorizer',
  identity.issuer,
  { jwtAudience: [identity.userPoolClient.userPoolClientId] },
)
```

IAM-Policies mit der alten Pool-ARN auf `identity.userPool.userPoolArn` umstellen; Outputs ergänzen:

```typescript
new cdk.CfnOutput(this, 'UserPoolId', { value: identity.userPool.userPoolId })
new cdk.CfnOutput(this, 'UserPoolClientId', {
  value: identity.userPoolClient.userPoolClientId,
})
new cdk.CfnOutput(this, 'UserPoolDomain', {
  value: `${identity.domainPrefix}.auth.${this.region}.amazoncognito.com`,
})
```

- [ ] **Step 8: Gesamte Infrastruktur prüfen**

Run: `cd apps/infrastructure && pnpm test && pnpm cdk synth`
Expected: alles grün, inkl. des bestehenden Tests „jede Route braucht JWT".

- [ ] **Step 9: Commit (nur auf Ansage)**

```bash
git add services/lambdas/pre-signup apps/infrastructure
git commit -m "feat(auth): user pool that allows sign-up without an email"
```

---

### Task 2: Schattenkonto anlegen und wiederfinden

**Files:**
- Create: `apps/mobile/src/features/auth/domain/shadowAccount.ts`
- Modify: `apps/mobile/src/vite-env.d.ts`, `apps/mobile/src/app/amplify.ts`
- Test: `apps/mobile/test/features/auth/domain/shadowAccount.test.ts`

**Interfaces:**
- Consumes: `getItem`, `setItem` aus `app/clientStorage`
- Produces:
  - `SHADOW_CREDENTIALS_KEY: string`
  - `type ShadowCredentials = { readonly username: string; readonly password: string }`
  - `generateShadowCredentials(): ShadowCredentials`
  - `loadShadowCredentials(): Promise<ShadowCredentials | null>`
  - `ensureShadowAccount(name?: string): Promise<string>` — liefert die Cognito-`sub`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/auth/domain/shadowAccount.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { generateShadowCredentials } from '../../../../src/features/auth/domain/shadowAccount'

describe('generateShadowCredentials', () => {
  test('produces a distinct username every time', () => {
    const first = generateShadowCredentials()
    const second = generateShadowCredentials()
    expect(first.username).not.toBe(second.username)
  })

  // Cognito's default policy rejects a password without all four classes,
  // and a rejected sign-up would strand the user with no account at all.
  test('password satisfies the default Cognito policy', () => {
    const { password } = generateShadowCredentials()
    expect(password.length).toBeGreaterThanOrEqual(16)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[!@#$%^&*]/)
  })

  // The username must never look like an email: in a pool with email as an
  // alias Cognito rejects such usernames.
  test('username is not email-shaped', () => {
    expect(generateShadowCredentials().username).not.toContain('@')
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test shadowAccount`
Expected: FAIL, Modul nicht gefunden

- [ ] **Step 3: Modul schreiben**

`apps/mobile/src/features/auth/domain/shadowAccount.ts`:

```typescript
// The shadow account: a normal Cognito user whose credentials the app
// invents and keeps for the user. It exists so a guest can talk to the
// API at all — see architecture/accountless-first-planned.md.

import {
  signUp,
  signIn,
  getCurrentUser,
  updateUserAttributes,
} from 'aws-amplify/auth'
import { getItem, setItem } from '../../../app/clientStorage'

export const SHADOW_CREDENTIALS_KEY = 'shopzebra_shadow_credentials'

export type ShadowCredentials = {
  readonly username: string
  readonly password: string
}

const PASSWORD_ALPHABET =
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*'

/** Random password that always contains all four character classes. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const body = Array.from(
    bytes,
    (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length],
  ).join('')
  return `${body}aA1!`
}

/** Called before the very first sign-up on this device. */
export function generateShadowCredentials(): ShadowCredentials {
  return { username: crypto.randomUUID(), password: randomPassword() }
}

/** A corrupt blob must not brick the boot — treat it as absent. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Called on app start to find out whether this device has an identity. */
export async function loadShadowCredentials(): Promise<ShadowCredentials | null> {
  const raw = await getItem(SHADOW_CREDENTIALS_KEY)
  if (raw === null) return null
  const parsed: unknown = safeParse(raw)
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'username' in parsed &&
    'password' in parsed &&
    typeof parsed.username === 'string' &&
    typeof parsed.password === 'string'
  ) {
    return { username: parsed.username, password: parsed.password }
  }
  return null
}

/**
 * Signs the device in, creating the shadow account on first use.
 *
 * The display name is written to the Cognito `name` attribute, not just to
 * the store: the server reads it through `CognitoUserDirectory` when it
 * writes `listMemberAdded`, and a shadow account has no other source.
 */
export async function ensureShadowAccount(name?: string): Promise<string> {
  const existing = await loadShadowCredentials()
  const credentials = existing ?? generateShadowCredentials()

  if (existing === null) {
    await signUp({
      username: credentials.username,
      password: credentials.password,
    })
    await setItem(SHADOW_CREDENTIALS_KEY, JSON.stringify(credentials))
  }

  await signIn({
    username: credentials.username,
    password: credentials.password,
  })
  if (name !== undefined && name !== '') {
    await updateUserAttributes({ userAttributes: { name } })
  }
  const { userId } = await getCurrentUser()
  return userId
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test shadowAccount`
Expected: PASS (3 Tests)

- [ ] **Step 5: Env-Variablen typisieren und Amplify umstellen**

In `apps/mobile/src/vite-env.d.ts` (existiert bereits mit `/// <reference types="vite/client" />`) die Env-Variablen ergänzen. **`interface`, nicht `type`** — Declaration Merging mit Vites globaler `ImportMetaEnv` funktioniert nur so; das ist der CLAUDE.md-Ausnahmefall „Contract":

```typescript
/// <reference types="vite/client" />

// Contract with the platform: merged into Vite's ImportMetaEnv so that
// import.meta.env stays fully typed (interface is required for merging).
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_USER_POOL_ID: string
  readonly VITE_USER_POOL_CLIENT_ID: string
  readonly VITE_USER_POOL_DOMAIN: string
}
```

In `amplify.ts` die drei hartkodierten Werte ersetzen (Werte aus den CDK-Outputs in `apps/mobile/.env.local`):

```typescript
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_USER_POOL_DOMAIN,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['http://localhost:5173/'],
          redirectSignOut: ['http://localhost:5173/'],
          responseType: 'code',
        },
      },
    },
  },
})
```

- [ ] **Step 6: Typprüfung**

Run: `cd apps/mobile && pnpm tsc --noEmit`
Expected: keine Fehler

- [ ] **Step 7: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src/features/auth/domain/shadowAccount.ts apps/mobile/src/app/amplify.ts apps/mobile/src/vite-env.d.ts apps/mobile/test/features/auth
git commit -m "feat(auth): shadow account credentials and provisioning"
```

---

### Task 3: Identität als Summentyp im Slice

**Files:**
- Create: `apps/mobile/src/features/auth/domain/localUser.ts`
- Modify: `apps/mobile/src/features/auth/domain/authSlice.ts`
- Test: `apps/mobile/test/features/auth/domain/authSlice.identity.test.ts`

**Interfaces:**
- Produces:
  - `LOCAL_USER_ID: string`
  - `type Identity = { readonly kind: 'none' } | { readonly kind: 'guest'; readonly userId: string; readonly name: string } | { readonly kind: 'linked'; readonly userId: string; readonly name: string; readonly email: string | null; readonly provider: AuthProvider }`
  - Actions `guestIdentityCreated({ userId, name })`, `identityLinked({ email, provider })`, `linkedIdentityRestored({ userId, name, email, provider })`, `identityAttached({ previousUserId, userId })`, `displayNameChanged({ name })`, `identityCleared()`
  - Selektoren `selectIdentity`, `selectHasIdentity`, `selectIsGuest`, `selectDisplayName`, `selectCurrentUserId`

- [ ] **Step 1: Sentinel-Modul anlegen**

`apps/mobile/src/features/auth/domain/localUser.ts`:

```typescript
// Before any server identity exists, this device still needs to say who
// authored its events. The sentinel is that author; ensureIdentity rewrites
// it to the real Cognito sub the moment the shadow account is created.
// The value can never collide with a Cognito sub (subs are UUID-shaped).
export const LOCAL_USER_ID = 'local-user'
```

- [ ] **Step 2: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/auth/domain/authSlice.identity.test.ts` — **Achtung (Review-Finding F):** der Slice exportiert `authReducer` benannt, keinen Default:

```typescript
import { describe, expect, test } from 'vitest'
import {
  authReducer,
  guestIdentityCreated,
  identityLinked,
  displayNameChanged,
  identityCleared,
  selectHasIdentity,
  selectIsGuest,
  selectDisplayName,
  selectCurrentUserId,
} from '../../../../src/features/auth/domain/authSlice'
import { LOCAL_USER_ID } from '../../../../src/features/auth/domain/localUser'

const fold = (actions: readonly { type: string }[]) =>
  actions.reduce(
    (state, action) => authReducer(state, action),
    authReducer(undefined, { type: '@@INIT' }),
  )

describe('identity', () => {
  test('starts as none — a fresh install owes nobody an account', () => {
    const auth = fold([])
    expect(selectHasIdentity({ auth })).toBe(false)
    expect(selectIsGuest({ auth })).toBe(false)
  })

  // Events authored before any account exists still need an author.
  test('without an identity the current user is the local sentinel', () => {
    expect(selectCurrentUserId({ auth: fold([]) })).toBe(LOCAL_USER_ID)
  })

  test('becomes a guest when the shadow account is created', () => {
    const auth = fold([guestIdentityCreated({ userId: 'u1', name: 'Chris' })])
    expect(selectHasIdentity({ auth })).toBe(true)
    expect(selectIsGuest({ auth })).toBe(true)
    expect(selectDisplayName({ auth })).toBe('Chris')
    expect(selectCurrentUserId({ auth })).toBe('u1')
  })

  // Linking must not mint a new identity — the userId is the whole point.
  test('linking keeps the userId and stops being a guest', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      identityLinked({ email: 'chris@example.com', provider: 'email' }),
    ])
    expect(selectIsGuest({ auth })).toBe(false)
    expect(auth.identity).toMatchObject({ kind: 'linked', userId: 'u1' })
  })

  test('renaming works in both states', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      displayNameChanged({ name: 'Christian' }),
    ])
    expect(selectDisplayName({ auth })).toBe('Christian')
  })

  test('clearing returns to none', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      identityCleared(),
    ])
    expect(selectHasIdentity({ auth })).toBe(false)
  })
})
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test authSlice.identity`
Expected: FAIL, Exporte fehlen

- [ ] **Step 4: Slice umbauen**

`AuthUser`/`state.auth.user` durch den Summentyp ersetzen:

```typescript
export type Identity =
  | { readonly kind: 'none' }
  | { readonly kind: 'guest'; readonly userId: string; readonly name: string }
  | {
      readonly kind: 'linked'
      readonly userId: string
      readonly name: string
      readonly email: string | null
      readonly provider: AuthProvider
    }
```

`AuthState.identity: Identity`, initial `{ kind: 'none' }`. Reducer:

```typescript
guestIdentityCreated: (
  state: AuthState,
  action: PayloadAction<{ readonly userId: string; readonly name: string }>,
): AuthState => ({
  ...state,
  identity: {
    kind: 'guest',
    userId: action.payload.userId,
    name: action.payload.name,
  },
  status: 'idle',
}),

identityLinked: (
  state: AuthState,
  action: PayloadAction<{
    readonly email: string | null
    readonly provider: AuthProvider
  }>,
): AuthState =>
  state.identity.kind === 'none'
    ? state
    : {
        ...state,
        identity: {
          kind: 'linked',
          userId: state.identity.userId,
          name: state.identity.name,
          email: action.payload.email,
          provider: action.payload.provider,
        },
      },

linkedIdentityRestored: (
  state: AuthState,
  action: PayloadAction<{
    readonly userId: string
    readonly name: string
    readonly email: string | null
    readonly provider: AuthProvider
  }>,
): AuthState => ({
  ...state,
  identity: { kind: 'linked', ...action.payload },
  status: 'idle',
}),

// Folded by lists/recipes via extraReducers — the auth slice itself only
// announces the rewrite, it holds no per-aggregate data.
identityAttached: (
  state: AuthState,
  _action: PayloadAction<{
    readonly previousUserId: string
    readonly userId: string
  }>,
): AuthState => state,

displayNameChanged: (
  state: AuthState,
  action: PayloadAction<{ readonly name: string }>,
): AuthState =>
  state.identity.kind === 'none'
    ? state
    : { ...state, identity: { ...state.identity, name: action.payload.name } },

identityCleared: (state: AuthState): AuthState => ({
  ...state,
  identity: { kind: 'none' },
  status: 'idle',
}),
```

Selektoren:

```typescript
import { LOCAL_USER_ID } from './localUser'

type AuthRoot = { readonly auth: AuthState }

export const selectIdentity = (state: AuthRoot): Identity => state.auth.identity
export const selectHasIdentity = (state: AuthRoot): boolean =>
  state.auth.identity.kind !== 'none'
export const selectIsGuest = (state: AuthRoot): boolean =>
  state.auth.identity.kind === 'guest'
export const selectDisplayName = (state: AuthRoot): string =>
  state.auth.identity.kind === 'none' ? '' : state.auth.identity.name
/** The author of everything this device writes — sentinel until attached. */
export const selectCurrentUserId = (state: AuthRoot): string =>
  state.auth.identity.kind === 'none'
    ? LOCAL_USER_ID
    : state.auth.identity.userId
```

- [ ] **Step 5: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test authSlice.identity`
Expected: PASS (6 Tests)

- [ ] **Step 6: Aufrufer nachziehen**

Run: `cd apps/mobile && pnpm tsc --noEmit`
Jede Verwendung von `state.auth.user`/`selectAuthUser` auf die neuen Selektoren umstellen. Erwartete Stellen: `ProfilePage.tsx`, `router.ts` (Session-Restore wird in Task 7 neu gebaut — hier zunächst kompilierfähig machen), `authThunks.ts`, `CreateListPage.tsx` (nur Typfix; der Guard fällt in Task 4), der Invite-Loader in `router.ts` (Owner-Check → `selectCurrentUserId`), Member-Avatare in `features/sharing/`.

**Keine Mühe in die Sign-in-Familie stecken:** `performSignIn/SignUp/ConfirmSignUp/ForgotPassword/ResetPassword` samt ihren Actions (`signInSucceeded`, `signUpSucceeded`, `confirmSignUpSucceeded`, …) und Pages werden in Task 8 **gelöscht** (M3 baut Sign-in mit OTP neu). Hier nur minimal kompilierfähig halten.
Expected am Ende: keine Fehler

- [ ] **Step 7: Alle Tests laufen lassen**

Run: `cd apps/mobile && pnpm test`
Expected: alle bestehenden Tests grün. **Falls einer rot wird: STOPPEN und melden.**

- [ ] **Step 8: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src/features/auth apps/mobile/test/features/auth
git commit -m "feat(auth): identity as none/guest/linked instead of a nullable user"
```

---

### Task 4: Lokale Urheberschaft + Andocken (Review-Finding A)

Der Kern des „alles ohne Sync"-Modells: Vor dem ersten Konto ist `LOCAL_USER_ID` der Autor aller Events. Beim Andocken wird einmalig umgeschrieben — Outbox **und** gefalteter State. Ohne diesen Task kann ein Gast keine Liste anlegen (`CreateListPage` rendert heute `null` ohne User), und der Server würde beim ersten Drain jedes Event ablehnen (`CreatorMustBeCaller`).

**Files:**
- Modify: `apps/mobile/src/app/sync/outbox.ts` (additive Funktion), `apps/mobile/src/features/lists/domain/listsSlice.ts`, `apps/mobile/src/features/recipes/domain/recipesSlice.ts`, `apps/mobile/src/features/lists/manage/CreateListPage.tsx`, Recipes-Anlegen analog, `apps/mobile/src/features/lists/domain/listsClientStorageHandler.ts` (+ Recipes-Handler)
- Test: `apps/mobile/test/app/sync/rewriteQueuedAuthor.test.ts`, `apps/mobile/test/features/lists/domain/listsSlice.identityAttached.test.ts`

**Interfaces:**
- Consumes: `LOCAL_USER_ID`, `selectCurrentUserId`, Action `identityAttached` (Task 3)
- Produces: `rewriteQueuedAuthor(previousUserId: string, userId: string): Promise<void>` in `outbox.ts` (nutzt das interne Storage-Handle des Moduls)

- [ ] **Step 1: Outbox-Rewrite-Test schreiben (schlägt fehl)**

`apps/mobile/test/app/sync/rewriteQueuedAuthor.test.ts` — Setup und Blob-Zugriff **aus `test/app/sync/outbox.test.ts` übernehmen** (dort steht das reale Blob-Format; nicht raten):

```typescript
import { describe, expect, test } from 'vitest'
import { rewriteQueuedAuthor } from '../../../src/app/sync/outbox'
// plus the same storage seeding helpers outbox.test.ts uses

describe('rewriteQueuedAuthor', () => {
  // The queued listCreated of a guest carries the sentinel — after the
  // shadow account exists the server would reject it (CreatorMustBeCaller).
  test('rewrites author fields in every queued entry', async () => {
    await seedQueue([
      entry('/lists', 'lists/listCreated', {
        listId: 'l1',
        name: 'Einkauf',
        ownerId: 'local-user',
      }),
      entry('/lists/l1/events', 'shopping/itemAdded', { itemId: 'i1' }),
    ]) // both entries created by 'local-user'

    await rewriteQueuedAuthor('local-user', 'sub-123')

    const entries = await queuedEntries()
    expect(entries[0].wire.payload.ownerId).toBe('sub-123')
    expect(entries[0].wire.createdBy ?? entries[0].wire.meta?.createdBy).toBe(
      'sub-123',
    )
    expect(entries[1].wire.createdBy ?? entries[1].wire.meta?.createdBy).toBe(
      'sub-123',
    )
  })

  // A list called "local-user" must survive: only author FIELDS are
  // rewritten, never arbitrary values.
  test('does not touch non-author fields with the same value', async () => {
    await seedQueue([
      entry('/lists', 'lists/listCreated', {
        listId: 'l1',
        name: 'local-user',
        ownerId: 'local-user',
      }),
    ])

    await rewriteQueuedAuthor('local-user', 'sub-123')

    const entries = await queuedEntries()
    expect(entries[0].wire.payload.name).toBe('local-user')
    expect(entries[0].wire.payload.ownerId).toBe('sub-123')
  })
})
```

Die Helfer `seedQueue`/`entry`/`queuedEntries` im Testfile implementieren; die exakte Wire-Form (`createdBy` top-level oder unter `meta`) beim Schreiben des Tests aus `wire.ts`/`outbox.test.ts` ablesen und die Assertions darauf festnageln.

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test rewriteQueuedAuthor`
Expected: FAIL, Export fehlt

- [ ] **Step 3: Rewrite-Funktion schreiben (additiv in `outbox.ts`)**

```typescript
// Author fields, and only these, are rewritten when the device docks onto
// its real identity. A value-based replace would corrupt user content that
// happens to equal the sentinel.
const AUTHOR_FIELDS = new Set(['createdBy', 'ownerId', 'userId', 'memberId'])
const AUTHOR_LIST_FIELDS = new Set(['memberIds'])

function rewriteAuthors(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteAuthors(entry, from, to))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (AUTHOR_FIELDS.has(key) && entry === from) return [key, to]
        if (AUTHOR_LIST_FIELDS.has(key) && Array.isArray(entry)) {
          return [key, entry.map((id) => (id === from ? to : id))]
        }
        return [key, rewriteAuthors(entry, from, to)]
      }),
    )
  }
  return value
}

/**
 * One-time migration at the moment the device gains its real identity:
 * every queued event authored by the local sentinel now belongs to the new
 * user. Runs strictly before the engine's first start — never mid-cycle.
 */
export async function rewriteQueuedAuthor(
  previousUserId: string,
  userId: string,
): Promise<void> {
  // Load the blob with the module's existing load helper, map every entry's
  // wire through rewriteAuthors, save with the existing save helper. Do not
  // duplicate the blob format.
}
```

Den Rumpf mit den vorhandenen Load/Save-Internas von `outbox.ts` füllen.

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test rewriteQueuedAuthor`
Expected: PASS (2 Tests)

- [ ] **Step 5: State-Rewrite-Test schreiben (schlägt fehl)**

`apps/mobile/test/features/lists/domain/listsSlice.identityAttached.test.ts` (Import- und Selektor-Namen an den echten Slice anpassen; Beobachtung über Selektoren, wie die bestehenden Slice-Tests es tun):

```typescript
import { describe, expect, test } from 'vitest'
import {
  listsReducer,
  listCreated,
  selectLists,
} from '../../../../src/features/lists/domain/listsSlice'
import { identityAttached } from '../../../../src/features/auth/domain/authSlice'

const fold = (actions: readonly { type: string }[]) =>
  actions.reduce(
    (state, action) => listsReducer(state, action),
    listsReducer(undefined, { type: '@@INIT' }),
  )

describe('identityAttached', () => {
  // The guest's lists were authored under the sentinel; after docking they
  // belong to the real sub — otherwise isOwner and the member row lie.
  test('rewrites ownerId and memberIds of every list', () => {
    const lists = selectLists({
      lists: fold([
        listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'local-user' }),
        identityAttached({ previousUserId: 'local-user', userId: 'sub-123' }),
      ]),
    })
    expect(lists[0].ownerId).toBe('sub-123')
    expect(lists[0].memberIds).toEqual(['sub-123'])
  })

  test('leaves foreign user ids alone', () => {
    const lists = selectLists({
      lists: fold([
        listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'other-sub' }),
        identityAttached({ previousUserId: 'local-user', userId: 'sub-123' }),
      ]),
    })
    expect(lists[0].ownerId).toBe('other-sub')
  })
})
```

- [ ] **Step 6: Fold implementieren**

In `listsSlice.ts` per `extraReducers` auf `identityAttached` reagieren (Muster: `preferencesSlice` reagiert auf `listDeleted`): jede Liste `ownerId`, `memberIds`, `memberNames`-Schlüssel von `previousUserId` auf `userId` mappen — explizit immutabel. In `recipesSlice.ts` analog für dessen Owner-Felder.

Run: `cd apps/mobile && pnpm test identityAttached`
Expected: PASS

- [ ] **Step 7: Erzeugen ohne Konto erlauben**

In `CreateListPage.tsx` den Guard entfernen und den Autor aus dem Selektor beziehen:

```typescript
const currentUserId = useAppSelector(selectCurrentUserId)
// The route no longer requires a signed-in user: before any account exists
// the local sentinel authors the event, docking rewrites it later.
// ...
dispatch(listCreated({ listId, name: result.name, ownerId: currentUserId }))
```

Recipes-Anlegen analog. Danach: `pnpm tsc --noEmit`.

- [ ] **Step 8: Persistenz des Rewrites sicherstellen**

Die Client-Storage-Handler persistieren auf Action-Match — `identityAttached` in die Match-Listen von `listsClientStorageHandler` und dem Recipes-Handler aufnehmen, sonst kehrt nach einem Neustart der Sentinel zurück.

- [ ] **Step 9: Alle Tests**

Run: `cd apps/mobile && pnpm test`
Expected: grün; bestehende Tests unverändert.

- [ ] **Step 10: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src apps/mobile/test
git commit -m "feat(auth): local authorship before an account, rewritten on docking"
```

---

### Task 5: Binäre Sync-Regel — Torwächter in `startSync`

**Files:**
- Modify: `apps/mobile/src/app/sync/startSync.ts`
- Test: `apps/mobile/test/app/sync/startSyncGate.test.ts`

**Interfaces:**
- Consumes: `selectHasIdentity` (Task 3)
- Produces: `startSync()` ist ohne Identität ein No-op

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/app/sync/startSyncGate.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest'

const engineStart = vi.fn(() => Promise.resolve())

vi.mock('../../../src/app/sync/syncEngine', () => ({
  syncEngine: { start: engineStart, stop: vi.fn(), refresh: vi.fn() },
}))
vi.mock('@capacitor/network', () => ({
  Network: { addListener: vi.fn(() => Promise.resolve()) },
}))
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(() => Promise.resolve()) },
}))

import { store } from '../../../src/app/store'
import { guestIdentityCreated } from '../../../src/features/auth/domain/authSlice'
import { startSync } from '../../../src/app/sync/startSync'

describe('the binary sync rule', () => {
  beforeEach(() => {
    engineStart.mockClear()
  })

  // Without an identity there is no account and no server contact at all —
  // events wait in the outbox.
  test('does not start the engine without an identity', () => {
    startSync()
    expect(engineStart).not.toHaveBeenCalled()
  })

  test('starts the engine once an identity exists', () => {
    store.dispatch(guestIdentityCreated({ userId: 'u1', name: 'Chris' }))
    startSync()
    expect(engineStart).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test startSyncGate`
Expected: FAIL beim ersten Test — die Engine startet heute bedingungslos

- [ ] **Step 3: Torwächter einbauen**

```typescript
import { selectHasIdentity } from '../../features/auth/domain/authSlice'

export function startSync(): void {
  if (started) return
  // A guest without a shadow account has nothing to sync with.
  if (!selectHasIdentity(store.getState())) return
  started = true
  // ... unverändert weiter
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `cd apps/mobile && pnpm test startSyncGate && pnpm test sync`
Expected: PASS; alle 14 bestehenden Sync-Testdateien unverändert grün — die Engine wurde nicht angefasst.

- [ ] **Step 5: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src/app/sync/startSync.ts apps/mobile/test/app/sync/startSyncGate.test.ts
git commit -m "feat(sync): no server contact before the device has an identity"
```

---

### Task 6: `ensureIdentity` — Konto anlegen, andocken, Sync starten

**Files:**
- Create: `apps/mobile/src/features/auth/domain/identityThunks.ts`
- Test: `apps/mobile/test/features/auth/domain/ensureIdentity.test.ts`

**Interfaces:**
- Consumes: `ensureShadowAccount` (Task 2), `guestIdentityCreated`/`identityAttached`/`identityCleared` (Task 3), `rewriteQueuedAuthor` (Task 4), `startSync` (Task 5), `LOCAL_USER_ID`
- Produces: `ensureIdentity(name?: string): (dispatch, getState) => Promise<void>`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/auth/domain/ensureIdentity.test.ts` — mit `beforeEach`-Reset, damit die Tests nicht von der Reihenfolge abhängen (Review-Finding N):

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest'

const ensureShadowAccount = vi.fn(() => Promise.resolve('sub-123'))
const rewriteQueuedAuthor = vi.fn(() => Promise.resolve())
const startSync = vi.fn()

vi.mock('../../../../src/features/auth/domain/shadowAccount', () => ({
  ensureShadowAccount,
}))
vi.mock('../../../../src/app/sync/outbox', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  rewriteQueuedAuthor,
}))
vi.mock('../../../../src/app/sync/startSync', () => ({ startSync }))

import { store } from '../../../../src/app/store'
import { ensureIdentity } from '../../../../src/features/auth/domain/identityThunks'
import {
  identityCleared,
  selectIsGuest,
} from '../../../../src/features/auth/domain/authSlice'

describe('ensureIdentity', () => {
  beforeEach(() => {
    ensureShadowAccount.mockClear()
    rewriteQueuedAuthor.mockClear()
    startSync.mockClear()
    store.dispatch(identityCleared())
  })

  // The whole point: the account appears at the first share, not at install —
  // and the queue is rewritten BEFORE the engine may flush it.
  test('creates the account, docks the queue, then starts syncing', async () => {
    await store.dispatch(ensureIdentity('Chris'))

    expect(ensureShadowAccount).toHaveBeenCalledWith('Chris')
    expect(rewriteQueuedAuthor).toHaveBeenCalledWith('local-user', 'sub-123')
    expect(selectIsGuest(store.getState())).toBe(true)
    expect(startSync).toHaveBeenCalledTimes(1)
    // Ordering: a flush before the rewrite would ship rejected events.
    expect(rewriteQueuedAuthor.mock.invocationCallOrder[0]).toBeLessThan(
      startSync.mock.invocationCallOrder[0],
    )
  })

  test('is idempotent — a second call creates no second account', async () => {
    await store.dispatch(ensureIdentity('Chris'))
    await store.dispatch(ensureIdentity('Chris'))
    expect(ensureShadowAccount).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test ensureIdentity`
Expected: FAIL, Modul nicht gefunden

- [ ] **Step 3: Thunk schreiben**

`apps/mobile/src/features/auth/domain/identityThunks.ts`:

```typescript
// Identity thunks. Auth is not optimistic: the guest identity only exists
// after Cognito confirms it, which is why these are thunks and not events.

import type { AppDispatch, RootState } from '../../../app/store'
import { startSync } from '../../../app/sync/startSync'
import { rewriteQueuedAuthor } from '../../../app/sync/outbox'
import { ensureShadowAccount } from './shadowAccount'
import { LOCAL_USER_ID } from './localUser'
import {
  guestIdentityCreated,
  identityAttached,
  selectHasIdentity,
} from './authSlice'

/**
 * Turns a purely local device into one the server knows. Called at the
 * first share or join (with a name); M2 will also call it before linking.
 * Order matters: dock the queue and the state BEFORE the engine may flush.
 */
export const ensureIdentity =
  (name?: string) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    if (selectHasIdentity(getState())) return

    const userId = await ensureShadowAccount(name)
    await rewriteQueuedAuthor(LOCAL_USER_ID, userId)
    dispatch(identityAttached({ previousUserId: LOCAL_USER_ID, userId }))
    dispatch(guestIdentityCreated({ userId, name: name ?? '' }))

    // Only now is there something to sync with — the queued events flush.
    startSync()
  }
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test ensureIdentity`
Expected: PASS (2 Tests)

- [ ] **Step 5: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src/features/auth/domain/identityThunks.ts apps/mobile/test/features/auth
git commit -m "feat(auth): ensureIdentity docks the local log onto the new account"
```

---

### Task 7: Boot — Identität aus der Session wiederherstellen (Review-Finding B)

Ohne diesen Task wäre die Identität nach jedem App-Neustart wieder `none`: Sync bliebe aus, und das Namens-Sheet käme erneut.

**Files:**
- Create: `apps/mobile/src/features/auth/domain/restoredIdentity.ts`
- Modify: `apps/mobile/src/app/router.ts` (Root-`beforeLoad`, ersetzt das bisherige `sessionRestored`)
- Test: `apps/mobile/test/features/auth/domain/restoredIdentity.test.ts`

**Interfaces:**
- Consumes: `Identity` (Task 3)
- Produces: `restoredIdentity(userId: string, attributes: { readonly email?: string; readonly name?: string; readonly provider?: string }): Identity`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/auth/domain/restoredIdentity.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { restoredIdentity } from '../../../../src/features/auth/domain/restoredIdentity'

describe('restoredIdentity', () => {
  // A session without an email belongs to a shadow account — the user never
  // registered anything, the app did.
  test('a session without email is a guest', () => {
    expect(restoredIdentity('sub-1', { name: 'Chris' })).toEqual({
      kind: 'guest',
      userId: 'sub-1',
      name: 'Chris',
    })
  })

  test('a session with an email is linked', () => {
    expect(
      restoredIdentity('sub-1', { email: 'c@example.com', name: 'Chris' }),
    ).toMatchObject({ kind: 'linked', email: 'c@example.com' })
  })

  test('a missing name stays empty, not undefined', () => {
    expect(restoredIdentity('sub-1', {})).toEqual({
      kind: 'guest',
      userId: 'sub-1',
      name: '',
    })
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test restoredIdentity`
Expected: FAIL, Modul nicht gefunden

- [ ] **Step 3: Ableitung schreiben**

`apps/mobile/src/features/auth/domain/restoredIdentity.ts`:

```typescript
import type { AuthProvider, Identity } from './authSlice'

/**
 * Maps a restored Cognito session to an identity. The email attribute is
 * the discriminator: only linking ever sets one on a shadow account.
 */
export function restoredIdentity(
  userId: string,
  attributes: {
    readonly email?: string
    readonly name?: string
    readonly provider?: string
  },
): Identity {
  const name = attributes.name ?? ''
  if (attributes.email === undefined) {
    return { kind: 'guest', userId, name }
  }
  const provider: AuthProvider =
    attributes.provider === 'google'
      ? 'google'
      : attributes.provider === 'apple'
        ? 'apple'
        : 'email'
  return { kind: 'linked', userId, name, email: attributes.email, provider }
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test restoredIdentity`
Expected: PASS (3 Tests)

- [ ] **Step 5: Root-`beforeLoad` umbauen**

In `router.ts` den bisherigen Session-Restore-Block ersetzen:

```typescript
// 1. Restore identity: an Amplify session (shadow or linked) wins; stored
//    shadow credentials without a live session mean the token cache was
//    cleared — sign in again silently. Neither → the device stays local.
try {
  const cognitoUser = await getCurrentUser()
  const attributes = await fetchUserAttributes()
  const identity = restoredIdentity(cognitoUser.userId, {
    email: attributes.email,
    name: attributes.name,
    provider: providerOfSession(/* identities claim, wie bisher gelesen */),
  })
  if (identity.kind === 'linked') {
    store.dispatch(linkedIdentityRestored(identity))
  } else {
    store.dispatch(
      guestIdentityCreated({ userId: identity.userId, name: identity.name }),
    )
  }
} catch {
  const credentials = await loadShadowCredentials()
  if (credentials !== null) {
    try {
      const userId = await ensureShadowAccount()
      store.dispatch(guestIdentityCreated({ userId, name: '' }))
    } catch {
      // Offline at boot: stay local, the outbox holds everything.
    }
  }
}
// 2. Hydration wie bisher; 3. startSync() — the gate makes it a no-op
//    while the device has no identity.
```

`linkedIdentityRestored` erwartet `{ userId, name, email, provider }` — aus dem `Identity`-Objekt destrukturieren, nicht casten.

- [ ] **Step 6: Alle Tests + Typen**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit`
Expected: grün

- [ ] **Step 7: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src apps/mobile/test
git commit -m "feat(auth): restore guest or linked identity at boot"
```

---

### Task 8: Router ohne Login-Zwang + Rückbau der Anmelde-Pfade

**Files:**
- Modify: `apps/mobile/src/app/router.ts`, `apps/mobile/src/app/RootLayout.tsx`, `apps/mobile/src/features/auth/profile/ProfilePage.tsx`, `apps/mobile/src/features/auth/domain/authThunks.ts`, `apps/mobile/src/features/auth/domain/authSlice.ts`
- Delete: `apps/mobile/src/features/auth/sign-in/`, `apps/mobile/src/features/auth/sign-up/`, `apps/mobile/src/features/auth/forgot-password/`

**Interfaces:**
- Consumes: Torwächter (Task 5), Boot-Restore (Task 7), `selectIdentity` (Task 3)

- [ ] **Step 1: Guards entfernen**

- `requireAuth` aus **allen** Routen entfernen; die Funktion selbst löschen, sobald keine Route sie referenziert. **Wichtig (Review-Finding G):** `requireAuth` trägt heute die Join-/Friend-Intent-Logik — ohne Login-Umweg braucht der Beitritt keine Intent-Zwischenspeicherung mehr; Task 10 verdrahtet den Direktweg. `joinIntentSlice` + Handler + deren Tests bleiben unangetastet (Test-Policy); ihr Rückbau ist eine separate Nutzer-Entscheidung.
- Index-Route (`path: '/'`) leitet unbedingt auf `/lists`.

- [ ] **Step 2: Anmelde-Pfade löschen**

Es gibt in M1/M2 nichts, wozu man sich anmelden könnte — Sign-in kommt mit M3 als OTP-Flow neu (Git-History bewahrt die alten Pages):

- Routen `/signin`, `/signup`, `/forgot-password` samt `requireGuest` entfernen; die drei Page-Ordner **löschen**.
- In `authThunks.ts` die Sign-in-Familie löschen (`performSignIn`, `performSignUp`, `performConfirmSignUp`, `performForgotPassword`, `performResetPassword`); in `authSlice.ts` die nur von ihnen genutzten Actions (`signInSucceeded`, `signInFailed`, `signUpSucceeded`, `signUpFailed`, `confirmSignUpSucceeded`, `confirmSignUpFailed`, `forgotPasswordCodeSent`, `forgotPasswordFailed`, `resetPasswordSucceeded`, `resetPasswordFailed`) und die dann toten State-Felder (`confirmationPending`, `resetPending`, `pendingEmail`) entfernen. `performSignOut` und `performChangeDisplayName` bleiben.
- Navigationsziele auf `/signin` beheben — `tsc` findet sie alle (typisierte Routen): `RootLayout.tsx:11` (Routen-Liste), Rest verschwindet mit den gelöschten Pages. Nach `performSignOut` → `/lists`.

- [ ] **Step 3: Profil-Falle für Gäste entschärfen**

`ProfilePage.tsx` zeigt heute bedingungslos „E-Mail", „Passwort ändern" und „Abmelden" (Zeile 170/184/235). Ein Gast hat nichts davon — und **„Abmelden" würde seine einzige Datenkopie wegwerfen** (`performSignOut` purged den Storage). Minimal-Zuschnitt für M1; der vollständige Gast-Umbau (Variante 2A, „Daten sichern", „Auf diesem Gerät löschen") ist M2:

```tsx
const identity = useAppSelector(selectIdentity)
// Guests own no email, no password, and nowhere to sign back in to — these
// rows return with M2/M3. In M1 nobody is 'linked', so they never render.
{identity.kind === 'linked' && (
  /* ...die bestehenden E-Mail-, Passwort- und Abmelden-Zeilen... */
)}
```

Auch „Konto löschen" unten fällt unter dieselbe Bedingung.

- [ ] **Step 4: Manuell prüfen**

Run: `cd apps/mobile && pnpm dev`, `localStorage.clear()`, neu laden.
Expected: App öffnet direkt die Listen-Übersicht. Liste anlegen und Items abhaken funktioniert (dank Task 4 auch ohne Identität); im Netzwerk-Tab kein einziger API-Request. Das Profil zeigt Avatar + Name, aber weder E-Mail- noch Passwort- noch Abmelden-Zeile.

- [ ] **Step 5: Alle Tests + Typen**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit`
Expected: grün. **Falls ein bestehender Test rot wird: STOPPEN und melden.**

- [ ] **Step 6: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src
git commit -m "feat(auth): the app opens without a login"
```

---

### Task 9: Screen 1A — Name beim ersten Teilen

Vorlage: `apps/mobile/design/pure/accountless/share-name.html`.

**Files:**
- Create: `apps/mobile/src/features/sharing/FirstShareNameSheet.tsx`
- Modify: `apps/mobile/src/features/sharing/InvitePage.tsx`
- Test: `apps/mobile/test/features/sharing/firstShareGate.test.ts`

**Interfaces:**
- Consumes: `ensureIdentity` (Task 6), `selectIdentity` (Task 3)
- Produces: `<FirstShareNameSheet confirmLabel?: string onDone={() => void} />`, `needsNameBeforeSharing(identity: Identity): boolean`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/sharing/firstShareGate.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { needsNameBeforeSharing } from '../../../src/features/sharing/FirstShareNameSheet'

describe('needsNameBeforeSharing', () => {
  // Asked exactly once — a guest who already shared has a name.
  test('asks a device without identity', () => {
    expect(needsNameBeforeSharing({ kind: 'none' })).toBe(true)
  })

  test('does not ask a guest who already has a name', () => {
    expect(
      needsNameBeforeSharing({ kind: 'guest', userId: 'u1', name: 'Chris' }),
    ).toBe(false)
  })

  test('does not ask a linked account', () => {
    expect(
      needsNameBeforeSharing({
        kind: 'linked',
        userId: 'u1',
        name: 'Chris',
        email: 'c@example.com',
        provider: 'email',
      }),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test firstShareGate`
Expected: FAIL, Modul nicht gefunden

- [ ] **Step 3: Sheet schreiben**

`apps/mobile/src/features/sharing/FirstShareNameSheet.tsx`:

```tsx
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch } from '../../app/store'
import type { Identity } from '../auth/domain/authSlice'
import { selectIdentity } from '../auth/domain/authSlice'
import { ensureIdentity } from '../auth/domain/identityThunks'

/** True while nobody on this device has a name others could see. */
export function needsNameBeforeSharing(identity: Identity): boolean {
  return identity.kind === 'none'
}

type Props = {
  readonly onDone: () => void
  /** "Weiter zum Einladen" on the invite page, "Beitreten" on the join page. */
  readonly confirmLabel?: string
}

/**
 * Screen 1A. Shown once, over the current page, before the very first
 * invite or join. Confirming creates the shadow account and flushes the
 * outbox.
 */
export function FirstShareNameSheet({ onDone, confirmLabel }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const identity = useSelector(selectIdentity)
  // Ephemeral UI state — the name only becomes app state once confirmed.
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  if (!needsNameBeforeSharing(identity)) return null

  const confirm = async () => {
    setBusy(true)
    await dispatch(ensureIdentity(name.trim()))
    setBusy(false)
    onDone()
  }

  return (
    <>
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-white/8 bg-[#1b1b21] px-6 pt-3 pb-8">
        <div className="mx-auto mb-[18px] h-1 w-[38px] rounded-sm bg-white/20" />
        <h2 className="mb-1.5 text-xl font-bold">Wie sollen dich andere sehen?</h2>
        <p className="mb-[18px] text-[13.5px] leading-relaxed text-white/50">
          Der Name steht neben deinen Änderungen in geteilten Listen. Du kannst
          ihn jederzeit ändern.
        </p>
        <input
          className="mb-4 w-full rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-base font-semibold outline-none focus:border-[#4E9DA6]"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
        <button
          className="w-full rounded-[15px] bg-[#4E9DA6] p-4 text-base font-bold disabled:opacity-50"
          disabled={name.trim() === '' || busy}
          onClick={() => void confirm()}
        >
          {confirmLabel ?? 'Weiter zum Einladen'}
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test firstShareGate`
Expected: PASS (3 Tests)

- [ ] **Step 5: In den Invite-Screen einhängen — Loader-Timing beachten**

**Der Invite entsteht heute im Route-Loader** (`router.ts`, Route `/lists/$listId/invite`: `fetchInvite` + Owner-Check) — der Loader läuft **vor** dem Render und damit vor der Identität. Ohne Identität liefert er `{ invite: null }` (der Owner-Check greift nicht), das ist okay — aber nach dem Sheet muss der Loader **erneut** laufen, sonst bleibt der Screen leer:

In `InvitePage.tsx`:

```tsx
const identity = useSelector(selectIdentity)
const router = useRouter()
const [nameDone, setNameDone] = useState(false)

if (needsNameBeforeSharing(identity) && !nameDone) {
  return (
    <FirstShareNameSheet
      onDone={() => {
        setNameDone(true)
        // The invite loader ran before the identity existed and returned
        // null — invalidate so it re-runs and mints the invite as the
        // freshly docked owner.
        void router.invalidate()
      }}
    />
  )
}
```

Zusätzlich im Loader: `selectAuthUser` → `selectCurrentUserId` (bereits in Task 3 Step 6 erfasst) — nach dem Andocken stimmt `list.ownerId === currentUserId` wieder.

- [ ] **Step 6: Ende-zu-Ende manuell prüfen**

Run: `pnpm dev`, `localStorage.clear()`, Liste anlegen, Items eintragen, „Teilen".
Expected: Sheet erscheint; nach Bestätigung existiert der Cognito-User, die lokal gesammelten Events landen mit der **echten** `sub` als Autor im DynamoDB-Log (nicht `local-user`!), Invite-Link wird erzeugt.

- [ ] **Step 7: Alle Tests + Build**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit && pnpm build`
Expected: grün

- [ ] **Step 8: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src/features/sharing apps/mobile/test/features/sharing
git commit -m "feat(sharing): ask for a name at the first share and create the account"
```

---

### Task 10: Beitritt als Gast (Review-Finding G)

Wer einen Invite-Link öffnet, tritt ohne Konto bei — dasselbe Namens-Sheet, derselbe `ensureIdentity`-Weg.

**Files:**
- Modify: die Join-Page-Komponente von `/join/$token` und `/friend/$token` (Pfade aus `router.ts` übernehmen)

**Interfaces:**
- Consumes: `FirstShareNameSheet` mit `confirmLabel` (Task 9), `ensureIdentity` (Task 6)

- [ ] **Step 1: Join-Route umbauen**

`/join/$token` und `/friend/$token` sind seit Task 8 ohne Guard erreichbar. In der Join-Page vor dem Beitritts-Command dasselbe Muster wie in Task 9 Step 5 — mit `confirmLabel="Beitreten"`. **Gleiche Loader-Falle wie beim Invite:** Falls der Join-Command heute in einem Loader/`beforeLoad` feuert, muss er in die Komponente hinter `onDone` wandern — er darf erst laufen, wenn die Identität existiert. Nach `onDone` ggf. `router.invalidate()`.

- [ ] **Step 2: Manuell prüfen (zwei Browser-Profile)**

Profil A: Liste teilen, Link kopieren. Profil B (frisch, `localStorage.clear()`): Link öffnen.
Expected: B sieht das Namens-Sheet, tritt nach Eingabe bei, beide sehen einander in der Mitgliederliste mit Namen; B hat nie ein Login-Formular gesehen.

- [ ] **Step 3: Alle Tests + Typen**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit`
Expected: grün

- [ ] **Step 4: Doku nachziehen**

`architecture/status.md`: Auth-Zeile auf „✅ ohne Konto nutzbar (M1); Sichern/Verknüpfen = M2, Zweitgerät = M3"; Gast-Betrieb, Andock-Mechanik, neuer Pool (jetzt in CDK — den Satz „Der User Pool selbst ist nicht in CDK" streichen) beschreiben. `architecture/accountless-first-planned.md`: Status auf „M1 umgesetzt, M2/M3 vertagt".

- [ ] **Step 5: Commit (nur auf Ansage)**

```bash
git add apps/mobile/src architecture
git commit -m "feat(sharing): join a list as a guest"
```

**→ Meilenstein 1 fertig.** App ohne Konto nutzbar, teilbar, beitretbar. Hier endet dieser Plan.

---

## Vermerkt für später: M2 und M3 — hier NICHT implementieren

> Entscheidung 2026-08-02: Erst M1 bauen. M2 und M3 bekommen eigene Pläne, wenn sie drankommen. Die folgenden Punkte — inklusive der zugehörigen Review-Findings — dürfen dabei nicht verloren gehen.

### M2 — Sichern/Verknüpfen (Schreibseite)

- **Screens:** 2A (Profil-Zeile „Daten sichern"), 3B (Google/Apple primär, E-Mail als Nachsatz), 4.1–4.3 (E-Mail → Code → Fertig), 5B (Adresse vergeben) — Click-Dummies liegen fertig in `design/pure/accountless/`
- **Backend:** `POST /account/email-availability` (`ListUsers`-Guard — Cognito lehnt eine vergebene Adresse NICHT selbst ab, Spike-Befund) und `POST /account/link-provider` (`AdminLinkProviderForUser`; Apple heißt bei Cognito `SignInWithApple`); Google/Apple-IdPs im Pool nachrüsten (Secrets via SSM)
- **Finding D (Reihenfolge!):** Provider-Identität **nativ** holen → linken → *nie* vorher über Cognito federieren, sonst entsteht ein Duplikat-User. In M2 wird gar nicht federiert, nur gelinkt
- **Finding J:** E-Mail genau einmal normalisieren (`trim().toLowerCase()`) — vor Guard **und** `updateUserAttributes`
- **Finding K:** Nativer Google-Login ist eine neue Dependency → Eintrag in `design-decisions.md`
- **Finding C (entschärft):** Ohne Sign-in (M3) verspricht Screen 4.3 zu viel — Text für den E-Mail-Fall: „Deine Listen sind jetzt mit … verknüpft" statt „auf jedem Gerät anmelden"
- **Finding I:** „Auf diesem Gerät löschen" (Gast) muss `SHADOW_CREDENTIALS_KEY` mitlöschen, sonst kehrt das alte Konto beim nächsten Teilen zurück
- **Profil-Zuschnitt:** Gast → `name, secure-data, delete-local`; verknüpft → `name, email-info`. **Kein Abmelden, kein Passwort-ändern** — beides wäre ohne Sign-in eine Aussperrung
- 5B endet in M2 bei „Andere Adresse verwenden" (kein Anmelden-Zweig)

### M3 — Zweitgerät

- **Sign-in auf weiteren Geräten per E-Mail-OTP (präferiert, Entscheidung 2026-08-02 — „moderner", kein Passwort).** Die Passwort-Alternative ist damit verworfen, sofern das M3-Design nichts Neues ergibt
- **Merge-Flow:** Backend `merge-token`/`merge-account` (Token einmalig einlösbar, `MembershipStore::transfer`), Screen 6A, Thunk `signInAndMerge`
- **Finding E:** Vor dem Merge-Token zwingend `ensureIdentity()` + Outbox-Drain abwarten — ein Gast, der nie geteilt hat, hat sonst weder Session noch Server-Daten
- **Finding H:** Merge muss auch **Freundschaften** übertragen; der verwaiste Gast-Cognito-User bleibt stehen (Namensauflösung alter Events) — dokumentieren
- **Finding O:** Nach dem Merge `syncEngine.refresh()`, damit die Konto-Aggregate sofort kommen
- „Stattdessen anmelden"-Zweig in 5B nachrüsten; Abmelden-/Konto-Zeilen im Profil für verknüpfte Konten
- **Rückbau des Join-Intent-Mechanismus** — `joinIntentSlice.test.ts` pinnt ihn; Entfernen nur nach Nutzer-Entscheidung

## Bekannte Grenzen

- **Bestehende Konten wandern nicht mit** (neuer Pool ist zwingend; der alte Pool hat E-Mail als Username, unveränderlich). Vor dem Launch unkritisch, aber eine Entscheidung, kein Versehen.
- **Capacitor-Peer-Mismatch** (`network`/`app` verlangen Core ≥8, App pinnt ^7) — vor Native-Builds unabhängig lösen.
- **Schattenkonto-Credentials liegen in Capacitor Preferences**, nicht im Biometrie-geschützten Keychain — für ein Zufallspasswort ohne Kontowert angemessen.
- **Apple-Linking ist nicht praktisch verifiziert** (betrifft M2; gleiche API wie Google).
