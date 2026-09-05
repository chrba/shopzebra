# Client-geprägte Identität: das Gerät ist von Anfang an, wer es bleibt

**Datum:** 2026-09-05
**Ersetzt:** den Docking-Mechanismus aus M1 („Ohne Konto starten", 2026-08-03)
**Bezug:** `architecture/accountless-first-planned.md`, `.claude/plans/2026-08-02-ohne-konto-starten.md`

## Problem

Die App startet ohne Konto. Ein Gast schreibt Events, die einen Autor brauchen,
also schreibt der Client einen Platzhalter: `ownerId: 'local-user'`. Beim ersten
Teilen entsteht ein Cognito-Schattenkonto, der Server vergibt eine `sub`, und
der Platzhalter muss überall auf sie umgeschrieben werden — in der Outbox auf
der Platte, in den gefalteten Bäumen und in der Pending-Queue des Reducers.
Drei Mechanismen (`Outbox.rewriteAuthor`, `identityAttached` mit
`extraReducers` in drei Slices, `pendingAuthorRewritten`), eine
Feldnamen-Heuristik (`AUTHOR_FIELDS`), die zweimal in verschiedener Form
existiert (generisch für Events, typisiert für State), und eine
Ordnungs-Constraint in `ensureIdentity`, die nichts erzwingt. Ein vergessener
Ort war ein echter Bug (Rebase holte den Platzhalter zurück).

Der Platzhalter existiert nur, weil die Identität an die **server-vergebene**
`sub` gebunden ist, die der Client erst nach dem Sign-up kennt.

## Kernidee

**Das Gerät prägt seine Nutzer-Id selbst, beim ersten Start. Sie ändert sich
nie.** Der Cognito-Username ist heute schon eine Client-UUID — nur wird sie
erst beim Sign-up erzeugt. Wird sie beim ersten Start erzeugt und ist *sie* die
Nutzer-Id, tragen alle Events von Anfang an den richtigen Autor. Der Server
liest den `username`-Claim des Access-Tokens statt `sub`. Es gibt nichts mehr
umzuschreiben.

```
heute:  itemAdded { addedBy: 'local-user' } → Konto → Rewrite → { addedBy: 'a3f9…' }
dann:   itemAdded { addedBy: 'a3f9…' }      → Konto mit Username a3f9… → fertig
```

## Entscheidungen

- **Identität = Cognito-Username = Client-UUID.** Backend liest
  `claims["username"]` (Access-Token; der Client schickt das Access-Token,
  `authFetch.ts`). Sicherheit gleichwertig zu `sub`: Username ist in Cognito
  eindeutig und unveränderlich, ein JWT mit Username X bekommt nur, wer sich
  als X authentifiziert. Die UUID verlässt das Gerät erst mit dem Sign-up
  selbst (binäre Sync-Regel), Vorab-Klauen scheitert an 122 Bit Zufall.
- **Drei Identitätszustände, alle mit Id:**
  `local { userId, name }` (Id geprägt, kein Konto) · `guest { userId, name }`
  (Schattenkonto existiert) · `linked { …, email, provider }`.
  `selectCurrentUserId` hat nur noch eine Bedeutung. `selectHasIdentity` heißt
  `selectHasAccount` — jeder Zustand *hat* eine Identität; die Frage ist, ob
  ein Konto dahintersteht (das ist, was Sync und Server-Fetches wissen müssen).
- **Ein persistierter Fakt:** `shopzebra_shadow_credentials { username,
  password, accountCreated }`, beim ersten Start geprägt — der Username ist
  die Nutzer-Id. Ob das Konto existiert, ist eine gecachte Markierung:
  `ensureShadowAccount` meldet sich erst an und legt das Konto nur an, wenn
  Cognito den Nutzer nicht kennt; eine verlorene Markierung heilt beim
  nächsten Teilen. Der Boot meldet sich nur an, wenn die Markierung gesetzt
  ist — ein Gerät, das nie geteilt hat, spricht mit niemandem.
- **Sign-out prägt eine neue Id.** Ein abgemeldetes Konto nimmt seine Id mit;
  das Gerät bekommt sofort eine frische (`identityCleared({ userId })`), sonst
  würde das nächste Teilen mit dem alten Username kollidieren.
- **Namensauflösung per `AdminGetUser(username)`** statt `ListUsers` mit
  `sub`-Filter. Direkter, und die CDK-Berechtigung wird `cognito-idp:AdminGetUser`.
- **M3 (Zweitgerät) bleibt serverseitig** — der bestehende Plan sieht
  `MembershipStore::transfer` vor, Events behalten ihren Gast-Autor, der
  Gast-User bleibt für die Namensauflösung stehen. Kein Client-Rewrite, weder
  jetzt noch dann. Die Rewrite-Maschinerie wird deshalb **vollständig**
  gelöscht, nicht nur umgangen.
- **Keine Daten, keine Migration.** Nichts ist live; die `sub`-keyed
  Membership-Zeilen des Test-Deployments verwaisen — akzeptiert.

## Was entfällt

`authorRewrite.ts`, `sharing/rewrittenMembership.ts`, `Outbox.rewriteAuthor`,
`SyncEngine.rewriteQueuedAuthor`, die Protokoll-Action
`pendingAuthorRewritten`, die Action `identityAttached` samt `extraReducers`
in `lists`/`shopping`/`recipes` und den drei Storage-Handler-Bedingungen,
`LOCAL_USER_ID`/`localUser.ts`, die Ordnungs-Constraint in `ensureIdentity`.
Tests: `rewriteQueuedAuthor.test.ts`, `listsSlice.identityAttached.test.ts`.

## Was bleibt

Schattenkonto, Pre-SignUp-Trigger, binäre Sync-Regel, `withSync`, Outbox,
`pendingRestored`, der Namensfluss (`deviceIdentified`, Cognito-`name`-Attribut).

## Server

- `lib/src/auth.rs`: `claims.get("username")`.
- `adapters/src/cognito_user_directory.rs`: `admin_get_user`,
  `UserNotFoundException` → `Ok(None)`.
- `apps/infrastructure/lib/ShopZebraApiStack.ts`: Policy `cognito-idp:AdminGetUser`.
- Domain unverändert: `UserId` ist ein opaker String, `createdBy == caller`
  bleibt ein Stringvergleich.

## Client

- Die Identität lebt in `auth/domain/shadowAccount.ts` (ersetzt
  `localUser.ts`): `ensureShadowCredentials`, `forgetShadowCredentials`,
  `ensureShadowAccount`, `restoreShadowSession`.
- `authSlice`: Zustand `local` mit `userId`; `deviceIdentified({ userId, name })`
  ersetzt `deviceNamed` am Boot; `identityCleared({ userId })`;
  `selectHasAccount`; `identityAttached` weg.
- `shadowAccount.ts`: `ensureShadowAccount(name?)` — Sign-in, bei
  `UserNotFoundException` Sign-up unter dem gespeicherten Username; gibt
  nichts zurück (die Id ist schon bekannt).
- `router.ts`: Boot dispatcht `deviceIdentified`; `restoreIdentity` nimmt
  `cognitoUser.username`.
- `identityThunks.ts`: `ensureIdentity` = Konto anlegen → `guestIdentityCreated`
  → `startSync()`. Drei Zeilen weniger, keine Reihenfolge mehr zu wahren.
- `authThunks.ts`: Sign-out vergisst `shopzebra_shadow_credentials` und prägt
  sofort neu.

## Doku

`accountless-first-planned.md` (Richtung + Status: Sentinel und Andocken sind
Geschichte), `status.md` §2 (M1-Absatz), `services/events.md` (Namensauflösung),
`README.md` des Sync-Ordners (Protokoll-Actions ohne `pendingAuthorRewritten`).

## Verworfen

- **Rewrite behalten, nur zentralisieren** — behandelt das Symptom; die
  Ursache (zwei Identitätsphasen) bleibt.
- **Autoren-Felder in den Deklarationen (`authors: ['addedBy']`)** — mehr
  Deklaration für einen Mechanismus, der ganz verschwinden kann.
- **`cognito:username` aus dem ID-Token** — der Client schickt das
  Access-Token; dort heißt der Claim `username`.
