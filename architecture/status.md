# Implementierungs-Stand — ShopZebra

**Stand: 2026-07-25** · Branch `feat/implement-backend`

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
| Backend-API | 🟡 Gerüst, keine funktionierende Route |
| Sync zum Server | ❌ verkabelt, aber ohne Wirkung |
| Offline-Queue | ❌ existiert nicht |
| Echtzeit (AppSync) | ❌ existiert nicht |
| Tests | 🟡 Vitest + 15 Verhaltens-Tests für `listsSlice`; Backend keine |

---

## 2. Frontend (`apps/mobile`)

### Gebaut

**Auth** — `features/auth/`. Sign-In, Sign-Up, Passwort-Vergessen über Cognito via Amplify. Session-Restore im `beforeLoad` der Root-Route. Route-Guards `requireAuth` / `requireGuest`.

**Listen** — `features/lists/` (`domain`/`overview`/`manage`). Übersicht mit Swipe-to-Delete, Erstellen (Ersteller = Owner, Owner-Modell), Umbenennen, Löschen. Actions folgen dem Wire-Format aus `events.md` (`listCreated { listId, name, ownerId }`, `listRenamed`, `listDeleted`); Member-Verwaltung ist aus der UI entfernt — sie kommt über Invite-Commands.

**Preferences** — `features/preferences/` mit eigenem Slice und eigenem Storage-Key (Farbe/Emoji pro Liste), wie in `domain-model.md` §3 vorgesehen. Reagiert per `extraReducers` auf `listDeleted`.

**Einkaufsliste** — `features/shopping/` (`domain`/`list-view`/`category`), Routen `/lists/$listId` und `/lists/$listId/category/$categoryId`. Events im Wire-Format (`itemAdded/Checked/Unchecked/Removed/Updated/NoteUpdated`, `customVariantAdded`), Compound-IDs für Varianten, Produktkatalog als statische Referenzdaten (aus `design/pure/list.html` generiert, 178 Produkte/10 Kategorien). UI: Tile-Grid (Tap = abhaken, Long-Press = Detail-Sheet), Erledigt-Sektion, Celebration, Katalog-Suche, Kategorie-Grid mit Toggle. Gemeinsames `ItemDetailSheet` (Varianten-Chips, Menge, Notiz, Custom-Variante, Entfernen). 16 Verhaltens-Tests.

Bewusst noch offen gegenüber den Prototypen: Emoji-Picker im Sheet (braucht `productPrefs` in preferences), Produkt-Memory beim Reselect, Confetti-Animation, Spracheingabe (Capacitor).

**Profil** — `features/profile/ProfilePage.tsx`.

**Infrastruktur** — `app/store.ts` mit den Slices `app`, `auth`, `lists`; Middleware-Pipeline `eventIdMiddleware → themeMiddleware → clientStorageMiddleware → syncMiddleware`. Eigenes `createSlice` ohne Immer. `clientStorage` als plattform-agnostischer Wrapper. Theme-Handling.

**Routen:** `/signin`, `/signup`, `/forgot-password`, `/lists`, `/lists/new`, `/lists/$listId`, `/lists/$listId/edit`, `/lists/$listId/category/$categoryId`, `/profile`.

### Nicht gebaut

- `features/recipes/`, `features/meal-plan/`, `features/activity/`

### Bekannte Provisorien

- **`router.ts` enthält sechs hartkodierte Demo-Listen** (`DEFAULT_LISTS`) samt Präferenzen als Fallback, wenn nichts gespeichert ist. Demo-Daten, kein Feature.
- **Member-Avatare sind Ableitungen aus der `memberId`** (Anfangsbuchstabe + deterministische Farbe) — Display-Namen kommen künftig aus server-geschriebenen `listMemberAdded`-Events. `FAMILY_MEMBERS` ist entfernt.
- `listsSyncHandler.ts` besteht aus zwei Funktionen, deren `authFetch`-Aufrufe **auskommentiert** sind. Es geht heute kein HTTP-Request an den Server.

---

## 3. Backend (`services/`)

### Gebaut

**`services/lib/`** — gemeinsame Crate mit `auth.rs` (User-ID aus dem JWT-Claim `sub` des API-Gateway-Authorizers), `error.rs`, `response.rs`, `runtime.rs`.

**`services/hello/`** — Beispiel-Lambda.

### Gerüst, nicht funktionsfähig

**`services/event-handler/`** — `handle()` loggt das Event und gibt `"Done1"` zurück. `persist()` und `is_duplicate_event()` sind implementiert, werden aber **nie aufgerufen**. Zusätzlich offen (siehe Task #4):

- `pk0` ist `USER#{user}`, muss `LIST#{listId}` werden
- `user` ist die Konstante `"user"`, kein echter Aufrufer
- `enum EventData` kennt nur `ListCreated` — braucht Envelope-Validierung statt Deserialisierung pro Typ
- Kein Publish auf AppSync

### Nicht gebaut

- DynamoDB Events Table (auch nicht im CDK)
- Snapshot Table
- Kein einziger Klasse-2-Command-Endpunkt
- AppSync Events

---

## 4. Infrastruktur (`apps/infrastructure`)

CDK-Projekt existiert — entgegen `project-structure.md`, wo es noch als „kommt später" steht.

`ShopZebraApiStack` instanziiert bislang nur den `EventHandler`-Construct (eine `RustFunction`). **HTTP-API, Cognito-Authorizer und Lambda-Integration sind auskommentiert**, DynamoDB-Tabellen gar nicht angelegt. Es gibt also keine erreichbare API.

Cognito selbst läuft (die App authentifiziert erfolgreich) — der User Pool ist offenbar außerhalb dieses Stacks angelegt.

---

## 5. Tests

**Frontend:** Vitest ist eingerichtet (`pnpm test` in `apps/mobile`). `listsSlice` hat 15 Verhaltens-Tests (Actions rein, Beobachtung nur über Selektoren — keine Mocks, kein State-Shape): Listen-CRUD, Präferenzen, Totalität bei unbekannten IDs, Referenzstabilität, Replay-Determinismus. Sie nageln das heutige Verhalten fest — inklusive des Full-State-`listUpdated`, das laut Spec noch in Intention-Events zerlegt werden muss (beim Umbau ändern sich diese Tests bewusst mit).

**Backend:** keine Tests.

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
4. Event Store entkoppeln (PK, ULID, Envelope-Validierung)
5. Sync Engine Stufe 1 — Outbox, Cursor, Retry
6. Property-Tests — Konvergenz, Rebase, Ack/Dedup, Totalität
7. Sync Engine Stufe 2 — `withSync`
8. Snapshots

Unabhängig davon offen: die Struktur-**Migration** (§8 — entschieden: Bounded Context), die beiden Produktfragen (§7) und `features/shopping/` — der Hauptscreen, ohne den die App ihren Zweck nicht erfüllt.

Kleinere Todos:
- **Code-Splitting**: Der Production-Build erzeugt einen 573-kB-Chunk (Amplify/Redux/Router in einem Bundle). Lazy Loading pro Route (`react-best-practices.md`) anwenden — CLAUDE.md fordert das für Mobile-Performance.
