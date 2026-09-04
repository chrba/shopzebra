# Sync-Lesbarkeits-Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die im Review von `apps/mobile/src/app/sync/` (2026-09-04) gefundenen Lesbarkeits-Mängel beseitigen — veraltete Kommentare, Namen die Historie statt Absicht tragen (`record`, `refresh`, `isSynced`, `ledger`, `dropped`, `local`), eine doppelt implementierte Meta-Setzung, und README-Redundanz. Kein Verhalten ändert sich.

**Architecture:** Reiner Rename-/Doku-Pass innerhalb von `app/sync/` plus zwei Aufrufern (`app/syncMiddleware.ts`, `app/sync/startSync.ts`). Vokabular danach durchgängig: Middleware **bietet** jede Action an (`offer`), die Policy entscheidet (`reachesServer`), die Engine läuft **einen Zyklus** (`requestSync` — kein zweiter Name), der Receive-Pfad macht aus einem `WireEvent` direkt ein `ConfirmedEvent`, und die Cursor-Sicht der Outbox heißt `Cursors`.

**Tech Stack:** TypeScript strict, Vitest, Prettier (vorhanden, kein Script).

**Spec:** Kein eigenes Spec-Dokument — der Review-Befund ist die Anforderung; Abschnitt „Befund → Task" unten bildet ihn ab.

## Global Constraints

- Alle Kommandos in `apps/mobile`. **Nichts wird committet oder gestaged** — der Nutzer entscheidet über Commits.
- Kein Verhalten ändert sich: `pnpm test` grün und `pnpm exec tsc --noEmit` sauber nach **jedem** Task; keine Test-Assertion ändert ihren Wert, nur Namen/Imports.
- Kein neues `any`, kein `as` (außer bestehenden Test-Fixtures). `readonly`, `const`. Kommentare Englisch, kurz, JSDoc an exportierten Funktionen mit „Called by …".
- **Test-Policy:** Folgende bestehende Tests ändern sich (nur Renames/Imports, keine Assertions) und brauchen die Freigabe des Nutzers: `test/app/sync/syncEngine.test.ts`, `syncEngine.cycle.test.ts`, `syncEngine.stop.test.ts`, `test/app/sync/receive/catchUp.test.ts`, `receive/guardedCursors.test.ts`, `receive/toLocalAction.test.ts` (→ umbenannt `toConfirmedEvent.test.ts`). **Ohne diese Freigabe darf mit Task 2 nicht begonnen werden.** Task 1 und Task 4 berühren keine Tests.
- Prettier nur auf den in diesem Plan geänderten Dateien (`pnpm exec prettier --write <files>`), nie auf `createSlice.ts`, `listsSlice.ts`, `memberCommands.ts` (dort ist Alt-Unformatiertheit bewusst nicht Teil dieses Passes).

## Befund → Task

| Review-Finding | Task |
|---|---|
| 1 `isSynced` vs `reachesServer`, toter TODO, doppelte `eventId`-Prüfung (`withSync.ts:229-234`) | 1 |
| 2 veraltete Kommentare: `withSync.ts:96` onRejected-Hook, `startSync.ts:1-2` „stage 1 has no push", `catchUp.ts:78` „Called at engine start…", `aggregate.ts:2` „nothing else" | 1, 2, 3, 4 |
| 3 `record()`/`refresh()` | 2 |
| 4 `toLocalAction` + `toConfirmedEvent` setzen dieselbe Meta | 3 |
| 5 „Ledger" | 3 |
| 6 `dropped(aggregate)`, `start(dispatch, local?)` | 2 |
| 7 `WireEvent` liegt nicht in `wire.ts` | 3 |
| 8 `opensAggregate` nicht konsequent, Doppel-Lookup in `toOutboxEntry` | 4 |
| 9 README-Bullets 72/73 doppelt, „Stage 1/2" undefiniert; `size()` ohne Doku | 5 |

---

### Task 1: `withSync.ts` — ein Prädikat-Name, keine Doppelprüfung, aktuelle Kommentare

**Files:**
- Modify: `apps/mobile/src/app/sync/withSync.ts`

**Interfaces:**
- Produces: `withSync(rootReducer, reachesServer)` — Signatur unverändert, nur Parametername.
- Kein Test ändert sich (`withSync.test.ts` übergibt das Prädikat positional).

- [ ] **Step 1: Header ohne Projektgeschichte**

Zeilen 1–5 ersetzen:

```ts
// The sync core (architecture/sync-engine.md §3): a higher-order reducer
// keeping two trees. `confirmed` folds the server-ordered log, `visible` is
// confirmed plus the own pending events replayed on top — the rebase.
// Feature reducers stay unchanged; all devices converge because they all
// fold the same log in the same position order.
```

- [ ] **Step 2: `pendingDiscarded`-Kommentar an die Realität anpassen**

Im JSDoc über `pendingDiscarded` den Satz `Dispatched by the engine's onRejected hook.` ersetzen durch `Dispatched by SyncEngine.syncOnce for every eventId the drain reported as rejected.`

- [ ] **Step 3: Parameter umbenennen und Doppelprüfung streichen**

Im JSDoc über `withSync` `` `isSynced` `` → `` `reachesServer` ``. Signatur:

```ts
export function withSync<S>(
  rootReducer: RootReducer<S>,
  reachesServer: (action: PayloadAction<unknown>) => boolean,
) {
```

Den Block am Ende der Funktion

```ts
    const visible = rootReducer(state.visible, action)
    // Only actions with an eventId can ever be confirmed and leave
    // pending again — anything else counts as local.
    // TODO: debug if thre are any events without id 
    return isSynced(action) && action.meta?.eventId !== undefined
      ? { confirmed: state.confirmed, pending: [...state.pending, action], visible }
      : { confirmed: rootReducer(state.confirmed, action), pending: state.pending, visible }
```

ersetzen durch

```ts
    const visible = rootReducer(state.visible, action)
    return reachesServer(action)
      ? { confirmed: state.confirmed, pending: [...state.pending, action], visible }
      : { confirmed: rootReducer(state.confirmed, action), pending: state.pending, visible }
```

Begründung (gehört nicht in den Code): `reachesServer` verlangt bereits `action.meta`, und `ActionMeta.eventId` ist Pflichtfeld — die zweite Prüfung war redundant.

- [ ] **Step 4: Prüfen**

Run: `pnpm vitest run test/app/sync/withSync.test.ts` — Expected: alle grün (die Test-Fixtures tragen alle `meta.eventId`; schlägt ein Test fehl, der ein synced Action ohne `meta` als lokal erwartet, **STOPP und melden** — dann wäre die Doppelprüfung Verhalten, nicht Redundanz).
Run: `pnpm test` und `pnpm exec tsc --noEmit` — Expected: grün / sauber.
Run: `pnpm exec prettier --write src/app/sync/withSync.ts`

---

### Task 2: Engine-API — `offer`, kein `refresh`, `deviceHoldings`, `droppedActionFor`

**Files:**
- Modify: `apps/mobile/src/app/sync/syncEngine.ts`
- Modify: `apps/mobile/src/app/syncMiddleware.ts`
- Modify: `apps/mobile/src/app/sync/startSync.ts`
- Modify (Tests, freigegeben): `test/app/sync/syncEngine.test.ts`, `test/app/sync/syncEngine.cycle.test.ts`, `test/app/sync/syncEngine.stop.test.ts`

**Interfaces:**
- Produces: `SyncEngine.offer(action)` (ersetzt `record`); `SyncEngine.requestSync()` ist der einzige Zyklus-Trigger (`refresh` entfällt); `start(dispatch, deviceHoldings?)` mit unverändertem Objekt-Typ `{ heldAggregates, dropAggregate }`.

- [ ] **Step 1: `syncEngine.ts`**

`record` → `offer`, inklusive JSDoc:

```ts
  /**
   * Offered every dispatched action by syncMiddleware; the policy decides
   * whether it is queued. Buffers until openLocalLog() ran.
   */
  offer(action: PayloadAction<unknown>): void {
```

Kommentar an `preStartBuffer` (`// Holds entries dispatched before start() finished loading the outbox.`) → `// Holds entries offered before openLocalLog() finished loading the outbox.`

`start`: Parameter `local?` → `deviceHoldings?` (Typ unverändert), Rumpf `if (deviceHoldings) { this.heldAggregates = deviceHoldings.heldAggregates; this.dropAggregate = deviceHoldings.dropAggregate }`. JSDoc-Zeile ergänzen: `@param deviceHoldings What this device holds and how to let go of one — Redux callbacks, installed here because the engine must not know about Redux.`

`refresh()` samt JSDoc **löschen**. Das JSDoc über `requestSync()` ergänzen um: `Also the resume/reconnect trigger (startSync) and the retry timer.`

JSDoc über `stop()`: `record() buffers again, refresh() no-ops` → `offer() buffers again, requestSync() no-ops`.

- [ ] **Step 2: `syncMiddleware.ts`**

`syncEngine.record(action)` → `syncEngine.offer(action)`. Kopfkommentar: `every dispatched action is offered to the sync engine, which decides via toOutboxEntry whether it enters the outbox` → `every dispatched action is offered to the sync engine; the composed sync policy decides whether it enters the outbox`.

- [ ] **Step 3: `startSync.ts`**

Header Zeilen 1–2 ersetzen:

```ts
// Lifecycle of the engine singleton + the resume/reconnect triggers.
```

`dropped` → `droppedActionFor`:

```ts
/**
 * The local fact that this device no longer holds an aggregate — the same
 * action leaving dispatches. Nothing is destroyed anywhere; this device just
 * stops holding it. Called by the engine for every aggregate the server no
 * longer shows us.
 */
function droppedActionFor(aggregate: Aggregate) {
  return aggregate.kind === 'recipe'
    ? recipeDropped({ recipeId: aggregate.id })
    : listDropped({ listId: aggregate.id })
}
```

Im `syncEngine.start(...)`-Aufruf: `dropAggregate: (aggregate) => store.dispatch(droppedActionFor(aggregate))`.

Die beiden Listener: `syncEngine.refresh()` → `void syncEngine.requestSync()`.

- [ ] **Step 4: Tests mitziehen (nur Namen)**

In `syncEngine.test.ts`, `syncEngine.cycle.test.ts`, `syncEngine.stop.test.ts`: jedes `engine.record(` → `engine.offer(`. In `syncEngine.stop.test.ts` Zeile ~78: `engine.refresh()` → `void engine.requestSync()`. Keine Assertion ändert sich.

- [ ] **Step 5: Prüfen**

Run: `grep -rn "\.record(\|\.refresh(\|dropped(" src test` — Expected: keine Treffer (außer `droppedActionFor(`).
Run: `pnpm test`, `pnpm exec tsc --noEmit` — grün / sauber.
Run: `pnpm exec prettier --write src/app/sync/syncEngine.ts src/app/syncMiddleware.ts src/app/sync/startSync.ts test/app/sync/syncEngine.test.ts test/app/sync/syncEngine.cycle.test.ts test/app/sync/syncEngine.stop.test.ts`

---

### Task 3: Receive-Pfad — `Cursors`, ein `toConfirmedEvent`, `WireEvent` in `wire.ts`

**Files:**
- Modify: `apps/mobile/src/app/sync/outbox.ts` (Interface umbenennen)
- Modify: `apps/mobile/src/app/sync/receive/guardedCursors.ts`
- Modify: `apps/mobile/src/app/sync/receive/catchUp.ts`
- Create: `apps/mobile/src/app/sync/receive/toConfirmedEvent.ts`; Delete: `receive/toLocalAction.ts`
- Modify: `apps/mobile/src/app/sync/wire.ts`, `receive/fetchEvents.ts`, `transport.ts`
- Modify: `apps/mobile/src/app/sync/syncEngine.ts` (`ledger:` → `cursors:` im `catchUp`-Aufruf)
- Modify (Tests, freigegeben): `test/app/sync/receive/catchUp.test.ts`, `receive/guardedCursors.test.ts`; `git mv receive/toLocalAction.test.ts receive/toConfirmedEvent.test.ts`

**Interfaces:**
- Produces: `interface Cursors { cursorFor; advanceCursor }` (ersetzt `ReceiveLedger`); `CatchUpDeps.cursors`; `cursorsGuardedByFoldedState(cursors, holdsFoldedStateFor)`; `toConfirmedEvent(event: WireEvent, domainPayloadOf): ConfirmedEvent`; `WireEvent` exportiert aus `wire.ts`.

- [ ] **Step 1: `outbox.ts` — `ReceiveLedger` → `Cursors`**

```ts
/** The receive path's view of the bridge (receive/catchUp.ts): one cursor per aggregate. */
export interface Cursors {
```

und `export class Outbox implements SendQueue, Cursors`. Über `size()` ergänzen: `/** Queue length. Used by tests; production code reads head()/queuedEntries(). */`

- [ ] **Step 2: `guardedCursors.ts`**

Import `type Cursors`; Doc-Kommentar erste Zeile `A ledger that only hands out cursors whose fold still exists.` → `Cursors that are only handed out while their fold still exists.`; `@param ledger The real ledger, usually the outbox.` → `@param cursors The real cursors, usually the outbox.`; Signatur `(cursors: Cursors, holdsFoldedStateFor): Cursors`, Rumpf `cursors.cursorFor(...)` / `cursors.advanceCursor(...)`.

- [ ] **Step 3: `wire.ts` bekommt den Wire-Typ**

Am Anfang von `wire.ts` (nach dem Kopfkommentar, der um einen Satz ergänzt wird: `The wire shape of a server event lives here too.`):

```ts
/** Server event in wire format — same shape as a Redux action, meta carries the log position. */
export type WireEvent = {
  readonly type: string
  readonly payload: Record<string, unknown>
  readonly meta: {
    readonly eventId: string
    readonly deviceId: string
    readonly userId: string
    readonly position: string
  }
}
```

In `receive/fetchEvents.ts` die lokale Definition löschen und `import type { WireEvent } from '../wire'` ergänzen. In `transport.ts`: `type WireEvent` aus dem `fetchEvents`-Import entfernen, `export type { WireEvent } from './receive/fetchEvents'` → `export type { WireEvent } from './wire'`, und `import type { WireEvent } from './wire'` ergänzen.

- [ ] **Step 4: `receive/toConfirmedEvent.ts` statt `toLocalAction.ts` + Doppelung in `catchUp.ts`**

Neue Datei:

```ts
// Policy edge of the receive path: a fetched server event becomes the
// confirmed event the withSync reducer folds.

import type { ConfirmedEvent } from '../withSync'
import type { WireEvent } from '../wire'

/**
 * Called by catch-up for every fetched event. meta.remote stops the echo:
 * the policy will not send it again and eventIdMiddleware keeps its identity.
 * The payload translation (createdBy → ownerId on opening events) comes from
 * the sync policy.
 */
export function toConfirmedEvent(
  event: WireEvent,
  domainPayloadOf: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>,
): ConfirmedEvent {
  return {
    type: event.type,
    payload: domainPayloadOf(event.type, event.payload),
    meta: { ...event.meta, remote: true },
  }
}
```

`git rm src/app/sync/receive/toLocalAction.ts`.

In `catchUp.ts`: Imports `type WireEvent` aus `'../wire'`, `type Cursors` aus `'../outbox'`, `toConfirmedEvent` aus `'./toConfirmedEvent'`; `ConfirmedEvent`-Import entfällt. `CatchUpDeps.ledger: ReceiveLedger` → `readonly cursors: Cursors`. Die lokale Funktion `toConfirmedEvent(deps, event)` **löschen**; `foldIntoConfirmedTree` wird

```ts
function foldIntoConfirmedTree(deps: CatchUpDeps, incoming: readonly WireEvent[]): void {
  deps.dispatch(
    eventsConfirmed(incoming.map((event) => toConfirmedEvent(event, deps.domainPayloadOf))),
  )
}
```

`eventsSinceCursor`: `deps.ledger.cursorFor(aggregate)` → `deps.cursors.cursorFor(aggregate)`; `advanceCursorPast`: `deps.ledger.advanceCursor(...)` → `deps.cursors.advanceCursor(...)`.

JSDoc über `catchUp` erste Zeile `Called at engine start, on app resume and on network reconnect.` → `The pull step of every sync cycle (SyncEngine.syncOnce), right after the push.`

In `syncEngine.ts` im `catchUp({...})`-Aufruf `ledger:` → `cursors:`.

- [ ] **Step 5: Tests mitziehen (nur Namen/Imports)**

`catchUp.test.ts`: `import type { WireEvent } from '@/app/sync/receive/fetchEvents'` → `from '@/app/sync/wire'`; die vier `ledger: outbox,` → `cursors: outbox,`.
`guardedCursors.test.ts`: `import type { ReceiveLedger } from '@/app/sync/outbox'` → `import type { Cursors } from '@/app/sync/outbox'`; Rückgabetyp `ReceiveLedger & { advanced: string[] }` → `Cursors & { advanced: string[] }`; Doc `/** A ledger that remembers …` → `/** Cursors that remember a position for every aggregate asked about. */`; Funktions-/Variablennamen `ledgerAt`/`ledger` dürfen bleiben oder zu `cursorsAt`/`cursors` werden — Assertions unverändert.
`git mv test/app/sync/receive/toLocalAction.test.ts test/app/sync/receive/toConfirmedEvent.test.ts`; darin `toLocalAction` → `toConfirmedEvent` (Import, `describe`, beide Aufrufe), WireEvent-Import auf `'@/app/sync/wire'`. Die erwarteten Objekte bleiben exakt gleich (die Funktion lieferte schon `{ ...wireMeta, remote: true }`).

- [ ] **Step 6: Prüfen**

Run: `grep -rn "ReceiveLedger\|toLocalAction\|ledger" src test` — Expected: keine Treffer (außer ggf. `ledgerAt`, falls in Step 5 belassen).
Run: `pnpm test`, `pnpm exec tsc --noEmit` — grün / sauber.
Run: `pnpm exec prettier --write src/app/sync/outbox.ts src/app/sync/receive/guardedCursors.ts src/app/sync/receive/catchUp.ts src/app/sync/receive/toConfirmedEvent.ts src/app/sync/wire.ts src/app/sync/receive/fetchEvents.ts src/app/sync/transport.ts src/app/sync/syncEngine.ts test/app/sync/receive/catchUp.test.ts test/app/sync/receive/guardedCursors.test.ts test/app/sync/receive/toConfirmedEvent.test.ts`

---

### Task 4: `syncPolicy.ts` und `aggregate.ts` — konsequente Helfer, ein Lookup

**Files:**
- Modify: `apps/mobile/src/app/sync/syncPolicy.ts`
- Modify: `apps/mobile/src/app/sync/aggregate.ts` (nur Kopfkommentar)

**Interfaces:** `SyncPolicy` unverändert. Keine Tests ändern sich.

- [ ] **Step 1: Typ-Guard statt Boolean, `routeOf` nutzt ihn**

`opensAggregate` ersetzen durch

```ts
type OpeningDeclaration = Extract<ActionDeclaration, { readonly opens: AggregateKind }>
type AppendingDeclaration = Extract<ActionDeclaration, { readonly on: AggregateKind }>

function opensAggregate(declaration: ActionDeclaration): declaration is OpeningDeclaration {
  return 'opens' in declaration
}

function appendsToAggregate(declaration: ActionDeclaration): declaration is AppendingDeclaration {
  return 'on' in declaration
}
```

(`AggregateKind` als `import type` aus `'./aggregate'` ergänzen.) In `routeOf`: `if ('opens' in declaration)` → `if (opensAggregate(declaration))`, `if ('on' in declaration)` → `if (appendsToAggregate(declaration))`.

- [ ] **Step 2: Ein Lookup pro Frage**

In `composeSyncPolicy` die Vorbedingung herausziehen und `reachesServer`/`toOutboxEntry` darauf aufbauen:

```ts
  const isOwnAction = (action: PayloadAction<unknown>): boolean =>
    action.meta !== undefined && !action.meta.remote

  const reachesServer = (action: PayloadAction<unknown>): boolean => {
    if (!isOwnAction(action)) return false
    const declaration = declarations.get(action.type)
    return declaration !== undefined && REACHES_SERVER[declaration.role]
  }
```

und

```ts
    toOutboxEntry: (action) => {
      if (!isOwnAction(action)) return null
      const declaration = declarations.get(action.type)
      if (!declaration || !REACHES_SERVER[declaration.role]) return null
      return routeOf(declaration, action)
    },
```

- [ ] **Step 3: `aggregate.ts` Kopf**

Zeile 2 `// A new aggregate kind (plans) extends these tables — nothing else.` → `// A new aggregate kind (plans) extends these tables and AggregateIdField in createSlice.ts.`

- [ ] **Step 4: Prüfen**

Run: `pnpm vitest run test/app/sync/syncPolicy.test.ts test/app/sync/appSyncPolicy.test.ts` — grün.
Run: `pnpm test`, `pnpm exec tsc --noEmit` — grün / sauber.
Run: `pnpm exec prettier --write src/app/sync/syncPolicy.ts src/app/sync/aggregate.ts`

---

### Task 5: README — ein Vokabular, keine Doppelung, „Stage" einmal erklärt

**Files:**
- Modify: `apps/mobile/src/app/sync/README.md`

- [ ] **Step 1: Titel und Einleitung**

Zeile 1 `# Sync Engine — Implementation (Stages 1 + 2)` → `# Sync Engine — Implementation`. Zeile 3 ersetzen durch:

> This directory contains the client side of the sync engine: outbox, cursor catch-up, retry, and the `withSync` rebase. Real-time receive via AppSync does not exist yet — the cursor catch-up is the only receive path. (Historical note: `status.md` calls the outbox/cursor/retry part "Stufe 1" and the rebase "Stufe 2"; this README uses those words only where it refers to that history.)

- [ ] **Step 2: Bullets zusammenlegen**

Die beiden Bullets `**\`features/sharing/memberCommands.ts\`** — …` und `**Class-2 events** (…) — …` durch **einen** Bullet ersetzen:

> - **Class-2 commands and their events** — invites, join, add/remove member are direct fetches in `features/sharing/memberCommands.ts`, because their answer is needed *before* anything can be shown; the events they cause (`lists/listMemberAdded`, `lists/listMemberRemoved`, and their `recipes/…` counterparts) are written by the server, arrive **only** through catch-up and never travel the outbox. The optimistic rows shown on the tap come from `localEvent` actions (`listMemberAddedLocally`, …), never from a faked server echo.

- [ ] **Step 3: Vokabular**

Alle Vorkommen `syncEngine.record()` → `syncEngine.offer()`; im Mermaid-Diagramm `MW3 -->|record| ENG` → `MW3 -->|offer| ENG` und `NET[network/app resume] -->|refresh| CU` → `NET[network/app resume] -->|requestSync| CU`; im Lifecycle-Diagramm `→ refresh() = one push-then-pull cycle` → `→ requestSync() = one push-then-pull cycle`. Jedes `toLocalAction` → `toConfirmedEvent`, jedes `ledger` → `cursors`.

- [ ] **Step 4: Prüfen**

Run: `grep -n -i "record()\|refresh\|toLocalAction\|ledger\|Stages 1 + 2" src/app/sync/README.md` — Expected: keine Treffer außer der historischen Notiz aus Step 1.

---

## Nach Abschluss

- `pnpm test`, `pnpm exec tsc --noEmit` grün; `pnpm exec prettier --check` auf allen in diesem Plan geänderten Dateien sauber.
- `sync-engine.txt` (Repo-Root) nennt `toOutboxEntry`, `record()`, `refresh` nicht — prüfen mit `grep -n "record()\|refresh()\|toLocalAction" ../../sync-engine.txt`; Treffer analog Task 5 anpassen.
- Alle Änderungen bleiben uncommitted; der Nutzer entscheidet.
