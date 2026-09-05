# Implementierungs-Stand — ShopZebra

**Stand: 2026-09-05** · Branch `feat/implement-backend`

Alle anderen Dokumente in `architecture/` und `services/events.md` beschreiben den **Zielzustand**. Dieses Dokument beschreibt, was davon heute existiert. Wer den Code bewertet, plant oder erweitert, liest es zuerst — sonst bewertet er eine App, die es so noch nicht gibt.

> ⚠️ Dieses Dokument veraltet schneller als alle anderen. Wenn es nicht mehr stimmt, ist es schädlicher als keins. Bei jedem abgeschlossenen Feature mit aktualisieren.

---

## 1. Auf einen Blick

| Bereich | Stand |
|---|---|
| Auth (Cognito) | ✅ **ohne Konto nutzbar (M1, 2026-08-03)** — Start ohne Login, Schattenkonto beim ersten Teilen/Beitreten. Sichern/Verknüpfen = M2, Zweitgerät = M3 (beide vertagt) |
| Listen-Übersicht + Verwaltung | ✅ funktionsfähig, lokal |
| Lokale Persistenz | ✅ funktionsfähig |
| **Einkaufsliste (Hauptscreen)** | ✅ funktionsfähig, lokal (Katalog + Suche + Varianten-Sheet) |
| **Rezepte** | ✅ funktionsfähig, **live verifiziert (2026-08-02)** — Sammlung, Anlegen/Bearbeiten, Detail mit Portions-Umrechnung, Teilen wie eine Liste |
| Adressbuch (Freunde) | ✅ funktionsfähig (2026-08-01) — Freundes-Invite, Annahme, Liste, Entfernen; Beitritt befreundet automatisch |
| Wochenplan, Aktivität, Family | ❌ existiert nicht |
| Backend-API | ✅ 13 Lambdas / 20 Routen, **alle deployed und live verifiziert (2026-08-02)**: Create-List, Create-Recipe, Append, Get-Events, Get-Lists, Get-Recipes, Create-Invite, Join, Add-Member, Remove-Member, 4× Friends. Sharing- und Event-Routen bedienen Listen **und** Rezepte auf denselben Lambdas; AppSync fehlt weiterhin |
| Sync zum Server | ✅ **Stufe 1 (Outbox, Cursor, Retry)** live verifiziert + **Stufe 2 (`withSync`-Rebase)** implementiert (2026-07-29, **nur unit-getestet, nicht live verifiziert**) |
| Offline-Queue | ✅ persistente Outbox mit Retry/Backoff (Retry-Pfad nur unit-getestet, nicht live) |
| Echtzeit (AppSync) | ❌ existiert nicht |
| Tests | 🟡 Frontend: 193 Tests; Backend: 93 Tests (81 Domain, 12 Adapter); Infrastruktur: 52 |

---

## 2. Frontend (`apps/mobile`)

### Gebaut

**Auth** — `features/auth/`. Sign-In, Sign-Up, Passwort-Vergessen über Cognito via Amplify. Session-Restore im `beforeLoad` der Root-Route. Route-Guards `requireAuth` / `requireGuest`.

**Listen** — `features/lists/` (`domain`/`overview`/`manage`). Übersicht mit Swipe-to-Delete, Erstellen (Ersteller = Owner, Owner-Modell), Umbenennen, Löschen. Actions folgen dem Wire-Format aus `events.md` (`listCreated { listId, name, ownerId }`, `listRenamed`, `listDeleted`); Member-Verwaltung ist aus der UI entfernt — sie kommt über Invite-Commands.

**Preferences** — `features/preferences/` mit eigenem Slice und eigenem Storage-Key (Farbe/Emoji pro Liste), wie in `domain-model.md` §3 vorgesehen. Reagiert per `extraReducers` auf `listDeleted`.

**Einkaufsliste** — `features/shopping/` (`domain`/`list-view`/`category`), Routen `/lists/$listId` und `/lists/$listId/category/$categoryId`. Events im Wire-Format (`itemAdded/Checked/Unchecked/Removed/Updated/NoteUpdated`, `customVariantAdded`), Compound-IDs für Varianten, Produktkatalog als statische Referenzdaten (aus `design/pure/list.html` generiert, 178 Produkte/10 Kategorien). UI: Tile-Grid (Tap = abhaken, Long-Press = Detail-Sheet), Erledigt-Sektion, Celebration, Katalog-Suche, Kategorie-Grid mit Toggle. Gemeinsames `ItemDetailSheet` (Varianten-Chips, Menge, Notiz, Custom-Variante, Entfernen). 16 Verhaltens-Tests.

Bewusst noch offen gegenüber den Prototypen: Emoji-Picker im Sheet (braucht `productPrefs` in preferences), Produkt-Memory beim Reselect, Spracheingabe (Capacitor). Celebration folgt `design/shadcn/list.html` (2026-07-29): Konfetti, Erledigt-Sektion bleibt sichtbar (automatisch zugeklappt), Kategorie-Zähler zählt auch erledigte Items.

**Ohne Konto starten (M1, 2026-08-03)** — `features/auth/domain/` (`shadowAccount`, `identityThunks`, `restoredIdentity`) + `features/sharing/FirstShareNameSheet`. Plan: `.claude/plans/2026-08-02-ohne-konto-starten.md`.

- **Identität ist ein Summentyp** `local | guest | linked` (`authSlice`) — alle drei tragen die `userId`, die das Gerät beim ersten Start prägt (`shadowAccount.ts`, Username der Schatten-Credentials); `selectCurrentUserId` hat eine Bedeutung. `AuthUser`, `sessionRestored`, die ganze Sign-in-Familie und die Seiten `sign-in`/`sign-up`/`forgot-password` sind **gelöscht** — Anmelden kommt mit M3 als OTP-Flow neu.
- **Kein Login-Zwang:** `requireAuth`/`requireGuest` sind weg, jede Route ist ohne Konto erreichbar. Listen anlegen, einkaufen und Rezepte schreiben funktioniert sofort
- **Schattenkonto beim ersten Teilen/Beitreten:** `ensureIdentity` legt einen normalen Cognito-User an (Username = die geräteeigene Nutzer-Id, Zufallspasswort, ohne E-Mail; Credentials im clientStorage), schreibt den Namen als `name`-Attribut und startet danach den Sync. Der Pool bestätigt jeden Sign-up per Pre-SignUp-Trigger — ohne E-Mail gibt es keinen Code
- **Kein Andocken mehr (2026-09-05):** Weil die Id vor dem Konto existiert und dessen Username ist, tragen alle Events von Anfang an den Autor, den das JWT beweist. Der Server liest `username` statt `sub`.
- **Binäre Sync-Regel an zwei Stellen:** `startSync()` startet die Engine nur mit Identität, und die Engine selbst lässt ohne `mayContactServer` keinen Zyklus laufen. Ein POST ohne Session käme als 401 zurück und `drainOutbox` würde das Event endgültig verwerfen
- **Das lokale Log lebt trotzdem:** `syncEngine.openLocalLog()` läuft bei **jedem** Boot — ohne ihn wären die Events eines Gastes nur im RAM (die Storage-Handler persistieren nur den `confirmed`-Tree, und der bleibt ohne Server leer) und ein Reload würde alles löschen
- **Profil ist zustandsabhängig:** E-Mail, Passwort ändern, Abmelden und Konto löschen erscheinen nur für ein verknüpftes Konto; ein Gast hat nichts davon, und „Abmelden" wäre für ihn ein getarnter Löschknopf. Der Namens-Block erscheint ab der ersten Identität
- **Bekannte Grenzen:** Der Join-Intent-Mechanismus (`joinIntentSlice`) wird nicht mehr angesteuert, bleibt aber liegen (sein Test pinnt ihn); Gerät verloren ohne Konto = Daten weg (akzeptiert); die Schattenkonto-Credentials liegen in Capacitor Preferences, nicht im Keychain

**Profil** — `features/profile/ProfilePage.tsx`.

**Startup-Skeleton** — `features/lists/overview/ListsPageSkeleton.tsx` (2026-07-29): Während das Root-`beforeLoad` bootet (Session-Restore + Hydration), zeigt der Router statt eines weißen Screens ein Shimmer-Skeleton der Listen-Übersicht (`defaultPendingComponent`, `pendingMs: 0`). Der Bootstrap läuft dank Guard (`selectIsAppLoaded`) nur noch einmal pro App-Start — Folge-Navigationen überspringen ihn. Design: `design/pure/proposals/loading-b-skeleton.html`.

**Infrastruktur** — `app/store.ts` mit den Slices `app`, `auth`, `lists`; Middleware-Pipeline `eventIdMiddleware → themeMiddleware → clientStorageMiddleware → syncMiddleware`. Eigenes `createSlice` ohne Immer. `clientStorage` als plattform-agnostischer Wrapper. Theme-Handling.

**Sync-Fan-out über alle Aggregat-Typen (2026-08-02):** `aggregate.ts` ist weiterhin die einzige Stelle mit Aggregat-Wissen, kennt jetzt aber `Aggregate = { kind, id }`. `catchUp` iteriert über alles, was der Nutzer sehen darf; `fetchAggregates()` ruft `GET /lists` **und** `GET /recipes` (eine unerreichbare Kollektion wird geloggt und übersprungen, sie blockiert die andere nicht). Cursor-Schlüssel sind kind-qualifiziert (`"list:abc"`), damit zwei Kinds mit derselben Id nie einen Cursor teilen.

**Sync-Engine Stufe 1** — `app/sync/` (2026-07-29, Plan `.claude/plans/2026-07-29-sync-engine-stufe-1-outbox-cursor.md`; Struktur + Doku: `app/sync/README.md`). Ordnerstruktur „zwei Pfade, eine Brücke" (2026-07-29): `send/` (`drainOutbox` — ein Queue-Durchlauf mit Ergebnis-Report, endgültiger 4xx-Drop; Backoff 1s→30s lebt seit dem Sync-Zyklus-Refactoring in der Engine, `sendEntry`) und `receive/` (`catchUp` mit `?since=<cursor>` statt Wipe-and-Refold, `fetchEvents`, `toConfirmedEvent`); auf Root-Ebene das Gemeinsame: `outbox.ts` (die Brücke — FIFO-Queue + Cursor pro Aggregate + eventId-Dedup in einem Blob `shopzebra_sync`, Rollen-Interfaces `SendQueue`/`Cursors`), `aggregate.ts` (deklariert die Aggregat-Arten in `AGGREGATE_KINDS` — Id-Feld und Collection pro Art; `idFieldOf`, `eventsPathFor` lesen daraus), `wire.ts` (`ownerId ↔ createdBy`-Paar), `transport.ts` (`Transport`-Interface + `httpTransport`), `syncEngine.ts` (Konstruktor nimmt Storage+Transport, `start(dispatch)` nur Lifecycle) + `startSync.ts` (StrictMode-Guard, Reconnect-Trigger via `@capacitor/network` + `@capacitor/app`). Outbox-Einträge sind einheitlich `{ path, wire }` — Routing zur Enqueue-Zeit. Policy (seit 2026-09-04): `synced: true` am Slice + Deklaration pro Reducer (`role`, für Events `on`/`opens`), komponiert in `app/sync/appSyncPolicy.ts`; `listCreated`/`recipeCreated` sind eröffnende Events (`opens`) → Collection-Endpunkt, keine Commands. `syncMiddleware` ist nur noch Enqueue-Effect; die Per-Feature-Handler (`listsSyncHandler`, `shoppingSyncHandler`) und `serverBootstrap.ts` sind gelöscht. **Boot ist local-first:** Storage-Hydration rendert sofort, Catch-up läuft im Hintergrund; `initialSyncDone` (appSlice) steuert Skeleton-Karten auf frischen Geräten. Die Demo-`DEFAULT_LISTS` sind entfernt.

**Live verifiziert (2026-07-29, Chrome gegen deployte API):** Outbox-POST → 201, Event landet im DynamoDB-Log, Cursor-Catch-up mit `?since`, eventId-Dedup (kein Doppel-Fold nach Reload), Duplikat-Healing bei der Hydration. **Nicht live verifiziert:** Offline-Retry/Backoff (nur Unit-Tests), Reconnect-Trigger nativ (Capacitor-Plugins deklarieren Peer-Core ≥8, App pinnt Core ^7 — vor Native-Builds auflösen).

**Sync-Engine Stufe 2 — `withSync` (2026-07-29, nur unit-getestet, nicht live verifiziert):** Higher-Order Reducer `app/sync/withSync.ts` um den kombinierten Feature-Reducer (`store.ts`): `SyncState = { confirmed, pending, visible }`, `visible` bleibt auf Top-Level (Selektoren/Middleware unverändert), Bookkeeping unter `state.sync` (reservierter Key). Synced Actions (Prädikat `appSyncPolicy.reachesServer`, dieselbe Policy wie der Send-Pfad) laufen optimistisch in `visible` + `pending`; alles andere in beide Bäume. Der Catch-up dispatcht pro Liste einen `eventsConfirmed`-Batch (eigene Events inklusive — kein Skip mehr, `appliedEventIds` ist entfernt); der Reducer faltet in Positions-Ordnung nach `confirmed`, entfernt geackte `eventId`s aus `pending` und rebased `visible = pending.reduce(rootReducer, confirmed)`. 4xx-Ablehnungen rollen ihren optimistischen Effekt per `pendingDiscarded` zurück. Persistenz umgestellt: Die Storage-Handler (lists/shopping) persistieren den **confirmed**-Baum bei jedem `eventsConfirmed`; Offline-Edits überleben Neustarts über die Outbox-Queue + `pendingRestored` beim Engine-Start (Rückübersetzung `domainActionOf`). Damit strukturell gelöst: Ordnungs-Divergenz bei nebenläufigen Edits, das Flush↔Catch-up-Race und stille 4xx-Effekte. **Verbleibende Grenzen:** Crash-Fenster zwischen Confirmed-Persist (Handler, fire-and-forget) und Cursor-Persist kann den Tail einer Liste doppelt nach `confirmed` falten (`itemAdded` merged Mengen by design → Verdopplung möglich); sichtbarer UI-Sprung beim Rebase; „last sync wins" bei Offline-Konflikten. Sign-in/Sign-out-Lifecycle: Der In-Session-Sign-in (`performSignIn`) startet die Engine genauso wie das Boot-`beforeLoad`; `performSignOut` stoppt die Engine zuerst und purged danach den Per-User-Storage (`shopzebra_sync`, `shopzebra_lists`, `shopzebra_list_preferences`, Shopping-Blob), damit auf einem geteilten Gerät kein Cross-User-Leak entsteht.

**Sync-Zyklus-Refactoring (2026-07-31, nur unit-getestet, nicht live verifiziert):** Die Callback-Choreografie der Engine (record→flush, catchUp→flush im `finally`, Flusher-Timer) ist durch einen **Push-then-Pull-Zyklus** ersetzt: Jeder Trigger — recorded Action, Boot, Sign-in, Reconnect, Resume, Retry-Timer — mündet in `requestSync()`; die gesamte Choreografie steht linear in `syncOnce()` (drainen → `pendingDiscarded` für Abgelehntes → Catch-up). Damit holt **jede eigene Aktion nach dem bestätigten Send sofort die Events vom Server** (prompter Ack + Quasi-Echtzeit beim aktiven Ko-Editieren); Pull-nach-Push per Konstruktion, kein Race POST↔GET, keine Rückkopplungsschleife. Single-Flight + Koaleszierung („läuft schon → danach genau einmal") leben einmal in der Engine. `flush.ts` → `send/drainOutbox.ts`: ein Queue-Durchlauf, gibt `{ delivered, rejected, blocked }` zurück, keine Timer/Callbacks mehr; Backoff (1s→30s) wohnt in der Engine, `stop()` cancelt den Retry-Timer (fixt einen Alt-Bug: der Flusher-Timer feuerte nach Sign-out weiter). Tests: `drainOutbox.test.ts` (ersetzt `flush.test.ts`) + `syncEngine.cycle.test.ts` (Zyklus, Ordering, Koaleszierung, Engine-Backoff, Stop-Cancel); `syncEngine.test.ts`/`syncEngine.stop.test.ts` unverändert grün — Public API der Engine unverändert.

**Routen:** `/signin`, `/signup`, `/forgot-password`, `/lists`, `/lists/new`, `/lists/$listId`, `/lists/$listId/edit`, `/lists/$listId/category/$categoryId`, `/profile`.

**Rezepte** — `features/recipes/` (`domain`/`overview`/`manage`/`detail`/`members`), Routen `/recipes`, `/recipes/new`, `/recipes/$recipeId`, `/recipes/$recipeId/edit`, `/recipes/$recipeId/members`, `/recipes/$recipeId/invite`. Eigenes Aggregat (`RECIPE#{id}`), `synced: true`; Anlegen ist ein Klasse-2-Command über die Outbox (`POST /recipes`), alles Weitere Klasse-1-Events. Sammlung als Kachel-Grid mit Suche und Swipe-to-Delete, Editor mit Icon-Sheet (Suche + Kategorien), Detail mit Portions-Stepper (reine Anzeige, skaliert nicht-numerische Mengen unverändert durch). Emoji/Farbe sind Local Preferences (`recipePrefs`). Design: `design/pure/recipe-workflow/{recipes,recipe,new-recipe}.html`.

**Teilen ist ein Mechanismus** — `features/sharing/` (2026-08-02): `MembersPage`/`InvitePage` sind aggregat-generisch (nehmen `Aggregate` + Wording als Props), `memberCommands` bauen ihre Pfade aus dem Kind. Listen und Rezepte verdrahten dieselben Screens über dünne Wrapper (`ListMembersPage`, `RecipeMembersPage`, …). Der Wochenplan hängt sich später genauso an.

### Nicht gebaut

- `features/meal-plan/`, `features/activity/`

### Bekannte Provisorien

- **Member-Avatare sind Ableitungen aus der `memberId`** (Anfangsbuchstabe + deterministische Farbe) — Display-Namen kommen künftig aus server-geschriebenen `listMemberAdded`-Events. `FAMILY_MEMBERS` ist entfernt.
- **Capacitor-Peer-Mismatch:** `@capacitor/network`/`@capacitor/app` verlangen Core ≥8, die App pinnt `@capacitor/core ^7` — funktioniert im Web-Dev, muss vor Native-Builds aufgelöst werden.

---

## 3. Backend (`services/`)

### Gebaut

**`services/domain/`** — das Hexagon nach [backend-structure.md](./backend-structure.md), ohne AWS-Dependencies: Envelope- **und JSON-Schema-Validierung** (13 Schemas als eingebettete Daten, Klasse-2-Typen werden am generischen Pfad abgelehnt), Owner/Membership-Regeln, Ports (`EventStore` mit Positions-Monotonie- und Dedup-Kontrakt, `MembershipStore`, `EventPublisher`), In-Memory-Adapter, Use Cases `append_event` (Klasse 1) und `create_list` (Klasse 2: Server claimt Ownership atomar und schreibt `listCreated` selbst). **20 Tests grün** (`cargo test`).

**`services/adapters/`** — DynamoDB-Implementierungen der Ports: `DynamoDbEventStore`, `DynamoDbMembershipStore`, dazu `NoopEventPublisher` als Platzhalter.

**`services/lambdas/append-event/`** — Lambda für `POST /lists/{listId}/events`: JWT → Membership → Envelope/Schema → Append an Server-Position → Broadcast (best-effort). Der generische Klasse-1-Pfad.

**`services/lambdas/create-list/`** — Lambda für `POST /lists`: erster Klasse-2-Command-Endpunkt.

**`services/lambdas/get-events/`** — Lambda für `GET /lists/{listId}/events?since=<position>`: der Cursor-Catch-up. Membership-Prüfung, ohne `?since` kommt der ganze Log (Bootstrap). Antwort im Wire-Format (`StoredEvent::to_wire`), direkt faltbar.

**`services/lambdas/get-lists/`** — Lambda für `GET /lists`: Listen-IDs des Aufrufers aus der Membership-Projektion — Startpunkt neuer Geräte und Reconnect-Fanout.

Alle Binaries leben unter `lambdas/` (Workspace-Glob `lambdas/*`); die drei Architektur-Crates `domain`/`adapters`/`lib` auf Root-Ebene — siehe [backend-structure.md](./backend-structure.md).

**`services/lib/`** — dünne HTTP-Hilfscrate (`auth.rs`, `error.rs`, `response.rs`, `wire.rs` für das Redux-Action-Wire-Format). Kein Domain-Code — der lebt in `domain/`.

### Offen

- **`EventPublisher` ist ein Noop** — kein echtes AppSync-Publish, andere Geräte erfahren nichts in Echtzeit
- Snapshot Table / Snapshot-Endpunkte
- Rate Limiting (API-Gateway-Usage-Plan)

### Altlast

~~`services/event-handler/` und `services/hello/`~~ — **entfernt (2026-07-27)**, ebenso der tote CDK-Construct `EventHandler.ts` und das ungenutzte `lib/runtime.rs`.

---

## 4. Infrastruktur (`apps/infrastructure`)

`ShopZebraApiStack` deckt alle sieben Endpunkte ab: Events- und Membership-Table (PAY_PER_REQUEST, Membership mit `byUser`-GSI), `RustFunction`s für `create-list`, `append-event`, `get-events`, `get-lists` (manifestPath `services/lambdas/…`), HTTP-API mit Cognito-JWT-Authorizer und Routen `POST /lists`, `GET /lists`, `POST`+`GET /lists/{listId}/events`, Grants nach Least-Privilege (Lese-Lambdas nur `grantReadData`). Dazu seit 2026-07-31 `create-invite`, `join-list` und `remove-member` mit den Routen `POST /lists/{listId}/invites`, `POST /lists/join` und `DELETE /lists/{listId}/members/{memberId}`; `join-list` und `get-lists` haben zusätzlich `cognito-idp:ListUsers` auf den User Pool. `cdk synth` läuft grün.

Seit 2026-08-03 liegt der **User Pool in CDK** (`lib/ShopZebraUserPool.ts`): E-Mail als Alias statt als Username, kein Pflichtattribut, Pre-SignUp-Trigger, `RemovalPolicy.RETAIN`. Beides — Alias und Pflichtattribute — ist nach Pool-Erstellung unveränderlich, deshalb war ein **neuer Pool zwingend** (Spike-Befund). Der alte Pool `eu-central-1_z6PK2KOsC` wird nicht mehr referenziert; **bestehende Konten wandern nicht mit**, das ist vor dem Launch bewusst akzeptiert. Pool-Id, Client-Id und Domain kommen als CfnOutputs heraus und gehören in `apps/mobile/.env.local` (`VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`, `VITE_USER_POOL_DOMAIN`) — `amplify.ts` hat keine hartkodierten Ids mehr.

Noch nicht im Stack: AppSync Events, Rate Limiting (Usage Plan). Der Cognito User Pool selbst lebt außerhalb dieses Stacks (ID hartkodiert).

**Nicht deployed:** Der Stand vom 2026-08-03 (neuer Pool + Pre-SignUp-Trigger + Authorizer auf den neuen Pool) ist `cdk synth`- und `cdk diff`-geprüft, aber **noch nicht ausgerollt**. Bis dahin läuft die App gegen einen Pool, den es noch nicht gibt — nach dem Deploy müssen die drei Outputs in `.env.local`.

---

## 5. Tests

**Frontend:** Vitest ist eingerichtet (`pnpm test` in `apps/mobile`). `listsSlice` hat 15 Verhaltens-Tests (Actions rein, Beobachtung nur über Selektoren — keine Mocks, kein State-Shape): Listen-CRUD, Präferenzen, Totalität bei unbekannten IDs, Referenzstabilität, Replay-Determinismus. Sie nageln das heutige Verhalten fest — inklusive des Full-State-`listUpdated`, das laut Spec noch in Intention-Events zerlegt werden muss (beim Umbau ändern sich diese Tests bewusst mit).

**Backend:** 20 Tests im `domain`-Crate gegen die In-Memory-Ports (`cargo test`): Envelope/Schema-Ablehnungen, Membership-Regeln, Append-Semantik (Monotonie, Dedup-Retry, Cursor). Die DynamoDB-Adapter selbst sind ungetestet (Integrationstests offen).

Relevant für die geplante Sync Engine: Der Rebase-Mechanismus und die Replay-Purity der Reducer sind genau die Art Logik, die ohne Tests unbemerkt kaputtgeht.

---

## 6. Features aus `product-spec.md` ohne Architektur-Abdeckung

Diese stehen als Kern-Features in der Produkt-Spec, haben aber **kein Event, keinen Endpunkt und keinen Domain-Type**:

| Feature | Fehlt |
|---|---|
| Teilen per **Link / QR-Code** | Implementiert (2026-07-31, siehe unten). Offen bleiben: echter QR-Code statt der Mockup-Attrappe, App Links (assetlinks.json / AASA) und der Widerruf von Tokens |
| **Push-Benachrichtigungen** | In `design-decisions.md` nur als *verworfener Sync-Transport* erwähnt, nie als Feature. Kein Token-Handling, kein Trigger, kein Event |
| **Smart Features** (Autocomplete aus Kaufhistorie, komplementäre Vorschläge, personalisierte Laden-Sortierung, wiederkehrende Items) | Kaufhistorie ist eine eigene Datendimension, die im Domain-Model nicht existiert |
| „Ich gehe einkaufen!"-Notification | — |
| Basics-Ausschluss und Duplikaterkennung beim Meal-Plan-Checkout | `ingredientsCheckedOut` trägt nur eine flache Zutatenliste |

---

### Mitglieder & Invite-Links (2026-07-31)

Ein Owner lädt per Link ein, der Eingeladene tritt bei, beide sehen einander mit Namen. Design: `.claude/plans/2026-07-31-list-members-invite-link-design.md`.

- **Backend:** `create_invite` (Owner-only, 7 Tage, Reuse), `join_list` (Token prüfen, Namen aus Cognito anreichern, `listMemberAdded` schreiben, Membership setzen), `remove_member` (`listMemberRemoved`). Ports `InviteStore` + `UserDirectory` werden als separate Use-Case-Parameter gereicht — die `Ports`-Struct und damit alle bestehenden Lambdas blieben unangetastet.
- **Owner-Name:** `GET /lists` liefert additiv `ownerNames`; das Feld `lists` behält seine Form, damit die Catch-up-Seite der Sync-Engine unverändert bleibt. Der Owner löst für sich selbst nie ein `listMemberAdded` aus, sein Name hat also kein Event.
- **Namen überhaupt:** Vor dieser Änderung setzte `signUp` keine User-Attribute und `handleSaveName` im Profil speicherte nichts — niemand hatte einen Namen. Das Sign-up-Formular fragt ihn jetzt ab (die Registrier-Seite hat kein Mockup, also keine Design-Abweichung), das Profil schreibt ihn per `updateUserAttributes`, und nach der Bestätigung meldet `autoSignIn` direkt an.
- **Join ohne Session:** `/join/$token` legt bei fehlender Session eine persistierte **Join-Intent** ab und leitet parameterlos auf `/signin`. `requireAuth` ist die einzige Stelle, die sie wieder auflöst — die Auth-Seiten wissen von Listen nichts. Bewusst kein `?redirect=`-Parameter: der hätte auf vier Sprünge verteilt werden müssen und überlebt keinen App-Kill, während der Eingeladene in der Mail-App den Bestätigungscode holt.
- **Bekannte Grenzen:** QR-Code ist die Attrappe aus dem Mockup; App Links fehlen, der Link funktioniert nur im Browser/WebView derselben Origin; Token-Widerruf fehlt; Konten von vor dieser Änderung haben weiterhin keinen Namen, bis er im Profil nachgetragen wird.

## 7. Offene Widersprüche und Folgefragen

**Vorgemerkt für später: Ohne Konto starten.** Die App soll eines Tages ohne
Registrierung nutzbar sein, inklusive Teilen, mit späterer Verknüpfung an ein
Konto. Noch nicht entworfen, aber bei neuen Entscheidungen mitzudenken —
Absicht und die Punkte, die man heute billig beachten kann, stehen in
[accountless-first-planned.md](./accountless-first-planned.md).


**A. Doppelt hinzugefügte Items** (offen, Produktentscheidung). `job-stories.md` §2 verlangt: *„When two family members add the same item at the same time, I want to see both entries and easily merge them."* Das Design macht das Gegenteil — deterministische `itemId`, die beiden Adds kollabieren automatisch, es gibt keine Merge-UI. Entweder ist die Job Story überholt, oder es fehlt ein UI-Element.

**B. Familien- vs. Listen-Mitgliedschaft — entschieden (2026-07-25):** Es gibt **kein Familien-Konzept**. Eine Liste hat einen **Owner** (ihren Ersteller); nur er erzeugt Invites (Link/QR-Token), jedes Mitglied kann sich selbst entfernen. Membership existiert ausschließlich pro Liste, die Server-Projektion pro Aggregate. Eingearbeitet in `events.md`, `sync-engine.md` §6, `domain-model.md` §2/§8.

**Folgefragen aus B (offen):**
- ~~**Wochenplan & Rezepte** sind jetzt user-scoped — sollen sie teilbar werden?~~ ✅ **beantwortet 2026-08-02** ([sharing-model.md](./sharing-model.md)): Liste, Rezept und Wochenplan werden exakt gleich geteilt. Für Rezepte umgesetzt, der Wochenplan hängt sich an dieselben Bausteine.
- **Ernährungspräferenzen** lebten auf dem gestrichenen Family-Aggregate — wohin damit (User-Aggregate, Local Preference, streichen)?
- **`product-spec.md` und `CLAUDE.md`** sprechen noch durchgängig von „Familie" (Family Feed, Familien-Settings, Vision) — Produkt-Texte müssen nachgezogen werden.

---

## 8. Ordner-Struktur: entschieden — Bounded Context, Migration offen

**Entschieden (2026-07-25):** Bounded-Context-Struktur aus [refactoring.md](./refactoring.md) — jedes Feature mit `domain/`-Subfolder und UI-Aspekten mit Business-Namen. `domain-model.md` §4 ist angeglichen.

**Migration durchgeführt (2026-07-25):** `lists/domain|overview|manage`, `auth/domain|sign-in|sign-up|forgot-password|profile`. `tsc`, Tests und Build grün. Neue Features folgen direkt dieser Struktur.

Verbleibende Namens-Abweichung: Spec sagt `listsSync.ts`, Code hat `listsSyncHandler.ts`.

---

## 9. Was als Nächstes ansteht

Die Sync- und Backend-Arbeit ist in Tasks aufgeteilt; Reihenfolge und Abhängigkeiten stehen in [sync-engine.md](./sync-engine.md) §9. Kurzfassung:

1. Membership-Loch schließen (Sicherheitsdefekt, unabhängig von allem anderen)
2. ~~`listUpdated` in Intention-Events zerlegen~~ ✅ 2026-07-25 (`listRenamed`; Member-Änderungen nur noch über Commands)
3. ~~`eventIdMiddleware`: `fromServer`-Actions überspringen~~ ✅ 2026-07-25
4. Event Store entkoppeln (PK, Sequenz-Position, Envelope- + Schema-Validierung ✅; Rate Limit offen)
5. ~~Sync Engine Stufe 1 — Outbox, Cursor, Retry~~ ✅ 2026-07-29 (live verifiziert; siehe §2)
6. **Property-Tests — Konvergenz, Rebase, Ack/Dedup, Totalität ← offen** (die 12 withSync-Unit-Tests decken die Kern-Szenarien beispielhaft ab, generalisieren sie aber nicht)
7. ~~Sync Engine Stufe 2 — `withSync`~~ ✅ 2026-07-29 (implementiert + unit-getestet; **live nicht verifiziert** — siehe §2)
8. Snapshots

Unabhängig davon offen: die Produktfrage A und die Folgefragen aus §7, das CDK-Nachziehen (§4 — neue Lambdas + Tabellen statt `event-handler`) sowie `features/recipes/`, `features/meal-plan/`, `features/activity/`.

Kleinere Todos:
- **Code-Splitting**: Der Production-Build erzeugt einen 573-kB-Chunk (Amplify/Redux/Router in einem Bundle). Lazy Loading pro Route (`react-best-practices.md`) anwenden — CLAUDE.md fordert das für Mobile-Performance.
