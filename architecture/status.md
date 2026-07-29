# Implementierungs-Stand — ShopZebra

**Stand: 2026-07-28** · Branch `feat/implement-backend`

Alle anderen Dokumente in `architecture/` und `services/events.md` beschreiben den **Zielzustand**. Dieses Dokument beschreibt, was davon heute existiert. Wer den Code bewertet, plant oder erweitert, liest es zuerst — sonst bewertet er eine App, die es so noch nicht gibt.

> ⚠️ Dieses Dokument veraltet schneller als alle anderen. Wenn es nicht mehr stimmt, ist es schädlicher als keins. Bei jedem abgeschlossenen Feature mit aktualisieren.

---

## 1. Auf einen Blick

| Bereich | Stand |
|---|---|
| Auth (Cognito) | ✅ funktionsfähig |
| Listen-Übersicht + Verwaltung | ✅ funktionsfähig, lokal |
| Lokale Persistenz | ✅ funktionsfähig |
| **Einkaufsliste (Hauptscreen)** | ✅ funktionsfähig, lokal (Katalog + Suche + Varianten-Sheet) |
| Wochenplan, Rezepte, Aktivität, Family | ❌ existiert nicht |
| Backend-API | ✅ 4 Endpunkte (Create, Append, Get-Events, Get-Lists) inkl. CDK; **deployed und live verifiziert (2026-07-29)**; AppSync fehlt |
| Sync zum Server | ✅ **Stufe 1 (Outbox, Cursor, Retry)** — live verifiziert; Rebase (`withSync`) fehlt noch |
| Offline-Queue | ✅ persistente Outbox mit Retry/Backoff (Retry-Pfad nur unit-getestet, nicht live) |
| Echtzeit (AppSync) | ❌ existiert nicht |
| Tests | 🟡 Frontend: 65 Tests (Slices + Sync-Engine); Backend: 20 Domain-Tests |

---

## 2. Frontend (`apps/mobile`)

### Gebaut

**Auth** — `features/auth/`. Sign-In, Sign-Up, Passwort-Vergessen über Cognito via Amplify. Session-Restore im `beforeLoad` der Root-Route. Route-Guards `requireAuth` / `requireGuest`.

**Listen** — `features/lists/` (`domain`/`overview`/`manage`). Übersicht mit Swipe-to-Delete, Erstellen (Ersteller = Owner, Owner-Modell), Umbenennen, Löschen. Actions folgen dem Wire-Format aus `events.md` (`listCreated { listId, name, ownerId }`, `listRenamed`, `listDeleted`); Member-Verwaltung ist aus der UI entfernt — sie kommt über Invite-Commands.

**Preferences** — `features/preferences/` mit eigenem Slice und eigenem Storage-Key (Farbe/Emoji pro Liste), wie in `domain-model.md` §3 vorgesehen. Reagiert per `extraReducers` auf `listDeleted`.

**Einkaufsliste** — `features/shopping/` (`domain`/`list-view`/`category`), Routen `/lists/$listId` und `/lists/$listId/category/$categoryId`. Events im Wire-Format (`itemAdded/Checked/Unchecked/Removed/Updated/NoteUpdated`, `customVariantAdded`), Compound-IDs für Varianten, Produktkatalog als statische Referenzdaten (aus `design/pure/list.html` generiert, 178 Produkte/10 Kategorien). UI: Tile-Grid (Tap = abhaken, Long-Press = Detail-Sheet), Erledigt-Sektion, Celebration, Katalog-Suche, Kategorie-Grid mit Toggle. Gemeinsames `ItemDetailSheet` (Varianten-Chips, Menge, Notiz, Custom-Variante, Entfernen). 16 Verhaltens-Tests.

Bewusst noch offen gegenüber den Prototypen: Emoji-Picker im Sheet (braucht `productPrefs` in preferences), Produkt-Memory beim Reselect, Spracheingabe (Capacitor). Celebration folgt `design/shadcn/list.html` (2026-07-29): Konfetti, Erledigt-Sektion bleibt sichtbar (automatisch zugeklappt), Kategorie-Zähler zählt auch erledigte Items.

**Profil** — `features/profile/ProfilePage.tsx`.

**Startup-Skeleton** — `features/lists/overview/ListsPageSkeleton.tsx` (2026-07-29): Während das Root-`beforeLoad` bootet (Session-Restore + Hydration), zeigt der Router statt eines weißen Screens ein Shimmer-Skeleton der Listen-Übersicht (`defaultPendingComponent`, `pendingMs: 0`). Der Bootstrap läuft dank Guard (`selectIsAppLoaded`) nur noch einmal pro App-Start — Folge-Navigationen überspringen ihn. Design: `design/pure/proposals/loading-b-skeleton.html`.

**Infrastruktur** — `app/store.ts` mit den Slices `app`, `auth`, `lists`; Middleware-Pipeline `eventIdMiddleware → themeMiddleware → clientStorageMiddleware → syncMiddleware`. Eigenes `createSlice` ohne Immer. `clientStorage` als plattform-agnostischer Wrapper. Theme-Handling.

**Sync-Engine Stufe 1** — `app/sync/` (2026-07-29, Plan `.claude/plans/2026-07-29-sync-engine-stufe-1-outbox-cursor.md`): `outbox.ts` (persistente FIFO-Queue + Cursor pro Liste + eventId-Dedup in einem Blob `shopzebra_sync`), `transport.ts` (confirmed/retry/rejected-Klassifikation), `flush.ts` (Single-Flight-Drain, Backoff 1s→30s, 4xx wird endgültig verworfen), `catchUp.ts` (`?since=<cursor>` statt Wipe-and-Refold), `syncedActions.ts` (`synced: true` am Slice ist die einzige Policy; einzige Klasse-2-Ausnahme `listCreated` → `POST /lists`), `syncEngine.ts` + `startSync.ts` (Singleton, StrictMode-Guard, Reconnect-Trigger via `@capacitor/network` + `@capacitor/app`). `syncMiddleware` ist nur noch Enqueue-Effect; die Per-Feature-Handler (`listsSyncHandler`, `shoppingSyncHandler`) und `serverBootstrap.ts` sind gelöscht. **Boot ist local-first:** Storage-Hydration rendert sofort, Catch-up läuft im Hintergrund; `initialSyncDone` (appSlice) steuert Skeleton-Karten auf frischen Geräten. Die Demo-`DEFAULT_LISTS` sind entfernt.

**Live verifiziert (2026-07-29, Chrome gegen deployte API):** Outbox-POST → 201, Event landet im DynamoDB-Log, Cursor-Catch-up mit `?since`, eventId-Dedup (kein Doppel-Fold nach Reload), Duplikat-Healing bei der Hydration. **Nicht live verifiziert:** Offline-Retry/Backoff (nur Unit-Tests), Reconnect-Trigger nativ (Capacitor-Plugins deklarieren Peer-Core ≥8, App pinnt Core ^7 — vor Native-Builds auflösen).

**Stufe-1-Grenzen (bewusst, bis `withSync`/Stufe 2):** Ordnungs-Divergenz bei nebenläufigen Edits wird erst durch den Rebase strukturell aufgelöst; Crash-Fenster zwischen Fold und Cursor-Persist kann den Tail einer Liste doppelt falten. `listCreated` ist seit dem Duplikat-Fix id-idempotent, aber `itemAdded` merged Mengen by design — ein erneutes Falten desselben Item-Events verdoppelt die Menge, kein No-Op. Zwei Race-/Crash-Fenster bleiben bis zum Stufe-2-Rebase offen: (a) ein Event kann per Catch-up ankommen, bevor sein eigener POST-Ack die `eventId` dedupliziert (Flush und Catch-up laufen nebenläufig); (b) der Cursor wird nach dem Falten persistiert, aber die Domain-State-Persistierung ist Fire-and-forget — ein Crash dazwischen kann Events hinter dem lokal gespeicherten Cursor zurücklassen, die dann lokal fehlen. Sign-in/Sign-out-Lifecycle: Der In-Session-Sign-in (`performSignIn`) startet die Engine genauso wie das Boot-`beforeLoad`; `performSignOut` stoppt die Engine zuerst und purged danach den Per-User-Storage (`shopzebra_sync`, `shopzebra_lists`, `shopzebra_list_preferences`, Shopping-Blob), damit auf einem geteilten Gerät kein Cross-User-Leak entsteht.

**Routen:** `/signin`, `/signup`, `/forgot-password`, `/lists`, `/lists/new`, `/lists/$listId`, `/lists/$listId/edit`, `/lists/$listId/category/$categoryId`, `/profile`.

### Nicht gebaut

- `features/recipes/`, `features/meal-plan/`, `features/activity/`

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
- **Membership-Commands fehlen** (`POST /lists/{id}/invites`, `POST /lists/join`, `DELETE /lists/{id}/members/{memberId}`) — die Abwehrseite von Task #1 steht (Allowlist lehnt Klasse-2-Typen ab), die Schreibseite nicht
- Snapshot Table / Snapshot-Endpunkte
- Rate Limiting (API-Gateway-Usage-Plan)

### Altlast

~~`services/event-handler/` und `services/hello/`~~ — **entfernt (2026-07-27)**, ebenso der tote CDK-Construct `EventHandler.ts` und das ungenutzte `lib/runtime.rs`.

---

## 4. Infrastruktur (`apps/infrastructure`)

`ShopZebraApiStack` ist vollständig für die vier existierenden Endpunkte: Events- und Membership-Table (PAY_PER_REQUEST, Membership mit `byUser`-GSI), `RustFunction`s für `create-list`, `append-event`, `get-events`, `get-lists` (manifestPath `services/lambdas/…`), HTTP-API mit Cognito-JWT-Authorizer und Routen `POST /lists`, `GET /lists`, `POST`+`GET /lists/{listId}/events`, Grants nach Least-Privilege (Lese-Lambdas nur `grantReadData`). `cdk synth` läuft grün.

Noch nicht im Stack: AppSync Events, Rate Limiting (Usage Plan). Der Cognito User Pool selbst lebt außerhalb dieses Stacks (ID hartkodiert).

**Nicht verifiziert: ob der Stack in dieser Form schon deployed ist.**

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
| Teilen per **Link / QR-Code** | Klasse-2-Endpunkte (`POST /lists/{id}/invites`, `POST /lists/join`) und App-Links-Anforderung (assetlinks.json / AASA) jetzt spezifiziert; Token-Format, Ablauf/Widerruf und QR-UI offen |
| **Push-Benachrichtigungen** | In `design-decisions.md` nur als *verworfener Sync-Transport* erwähnt, nie als Feature. Kein Token-Handling, kein Trigger, kein Event |
| **Smart Features** (Autocomplete aus Kaufhistorie, komplementäre Vorschläge, personalisierte Laden-Sortierung, wiederkehrende Items) | Kaufhistorie ist eine eigene Datendimension, die im Domain-Model nicht existiert |
| „Ich gehe einkaufen!"-Notification | — |
| Basics-Ausschluss und Duplikaterkennung beim Meal-Plan-Checkout | `ingredientsCheckedOut` trägt nur eine flache Zutatenliste |

---

## 7. Offene Widersprüche und Folgefragen

**A. Doppelt hinzugefügte Items** (offen, Produktentscheidung). `job-stories.md` §2 verlangt: *„When two family members add the same item at the same time, I want to see both entries and easily merge them."* Das Design macht das Gegenteil — deterministische `itemId`, die beiden Adds kollabieren automatisch, es gibt keine Merge-UI. Entweder ist die Job Story überholt, oder es fehlt ein UI-Element.

**B. Familien- vs. Listen-Mitgliedschaft — entschieden (2026-07-25):** Es gibt **kein Familien-Konzept**. Eine Liste hat einen **Owner** (ihren Ersteller); nur er erzeugt Invites (Link/QR-Token), jedes Mitglied kann sich selbst entfernen. Membership existiert ausschließlich pro Liste, die Server-Projektion pro Aggregate. Eingearbeitet in `events.md`, `sync-engine.md` §6, `domain-model.md` §2/§8.

**Folgefragen aus B (offen):**
- **Wochenplan & Rezepte** sind jetzt user-scoped — sollen sie teilbar werden, und wenn ja, über welchen Mechanismus?
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
6. **Property-Tests — Konvergenz, Rebase, Ack/Dedup, Totalität ← nächster Schritt**
7. Sync Engine Stufe 2 — `withSync`
8. Snapshots

Unabhängig davon offen: die Produktfrage A und die Folgefragen aus §7, das CDK-Nachziehen (§4 — neue Lambdas + Tabellen statt `event-handler`) sowie `features/recipes/`, `features/meal-plan/`, `features/activity/`.

Kleinere Todos:
- **Code-Splitting**: Der Production-Build erzeugt einen 573-kB-Chunk (Amplify/Redux/Router in einem Bundle). Lazy Loading pro Route (`react-best-practices.md`) anwenden — CLAUDE.md fordert das für Mobile-Performance.
