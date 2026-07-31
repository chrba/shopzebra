# Sync Engine — Implementation (Stages 1 + 2)

This directory contains the client side of the sync engine: **outbox, cursor catch-up, retry (stage 1) and the `withSync` rebase (stage 2)**. Real-time receive via AppSync does not exist yet — the cursor catch-up is the only receive path.

The whole mechanism in one line — implemented by `withSync.ts`:

```
visibleState = fold(rootReducer, fold(rootReducer, confirmed, serverLog), pending)
```

Stage 1 moves events reliably (outbox + retry out, cursor catch-up in); stage 2 keeps two trees — `confirmed` (fold of the server-ordered log) and `visible` (confirmed + own pending events replayed on top). When a confirmation batch arrives, it folds into `confirmed` at server order and the remaining pending events replay on top: the rebase, one line — `pending.reduce(rootReducer, confirmed)`. All devices fold the same log in the same position order, so they converge by construction.

---

## Core principle

Conflicts are **not** merged on the client. On append, the server assigns a strictly increasing, gapless **position per list** (aggregate); all clients fold the events in exactly that order. Convergence holds by construction, not by merge rules — no CRDTs, no field versions, no last-writer-wins clocks.

The engine exploits the project's central uniformity: **Redux action = domain event = wire format.** A `{ type, payload, meta }` goes over the wire unchanged. There is no mapping layer — which is why a new event type costs **zero lines of sync code**: `synced: true` on the slice is enough.

---

## The two trees — how the rebase works (`withSync`)

The store keeps two trees plus the pending queue. Every action reaches them in one of three ways:

```mermaid
flowchart TB
    subgraph SyncState [SyncState — sync bookkeeping + visible top level]
        C[confirmed<br/>fold of the server-ordered log]
        P[pending<br/>own unconfirmed events, dispatch order]
        V[visible<br/>what selectors read]
    end
    A1[own synced event<br/>e.g. itemChecked] -->|append| P
    A1 -->|apply optimistically| V
    A2[local-only action<br/>hydration, preferences, theme] -->|apply| C
    A2 -->|apply| V
    A3[eventsConfirmed batch<br/>from catch-up] -->|fold in position order| C
    A3 -->|remove acked eventIds| P
    C -.->|REBASE: replay pending on top| V
```

Local-only actions go to **both** trees on purpose: `visible` is recomputed from `confirmed + pending` on every rebase — anything that only reached `visible` would be erased by the next confirmation.

Worked example — two devices edit the same quantity concurrently; the server orders Mama's event first (position 07), Papa's second (08):

```
                     Papa's device              Mama's device
own dispatch         visible 2, pending [2]     visible 5, pending [5]
                       (confirmed still empty on both — devices DISAGREE)

eventsConfirmed([qty 5 @07, qty 2 @08])   ← same batch on both devices
  fold into confirmed:   fold(5, then 2) = 2    fold(5, then 2) = 2
  acked → pending:       []                     []
  rebase visible:        2                      2   ✓ CONVERGED
```

Without the rebase each device would keep folding in its own arrival order — Papa would end at 5, Mama at 2, permanently. That silent divergence is exactly what stage 2 removes.

---

## Two paths, one bridge

The folder structure mirrors the architecture: `send/` is the write path, `receive/` is the read path, and everything at root level belongs to **both** paths — above all the outbox as the deliberately shared bridge. What each file does is documented in its own header.

Outside this folder, but part of the mechanism:

- **`app/store.ts`** — wires `withSync` around the combined feature reducers. The visible tree stays at top level (`state.lists` etc. — every selector, middleware and `getState()` caller reads it unchanged); `confirmed` and `pending` live under `state.sync`. `sync` is a reserved top-level key.
- **`app/syncMiddleware.ts`** — a single effect: every dispatched action is offered to `syncEngine.record()`. No per-feature handlers, no `if` chains.
- **`app/eventIdMiddleware.ts`** — stamps `eventId` + `deviceId` **before** the reducer. Actions with `meta.remote` keep their identity (otherwise dedup and ack matching would break).
- **`app/createSlice.ts`** — `synced: true` on a slice registers the slice name; `belongsToSyncedSlice()` feeds the shared `needsSync()` predicate.
- **`features/*/domain/*ClientStorageHandler.ts`** (lists, shopping) — persist the **confirmed** tree on every `eventsConfirmed`. Optimistic events are not persisted there; they survive restarts via the outbox queue + `pendingRestored`.

```mermaid
flowchart LR
    subgraph store [Redux Store]
        MW1[eventIdMiddleware] --> MW2[withSync reducer<br/>confirmed + pending + visible] --> MW3[syncMiddleware]
    end
    UI[Component<br/>dispatch] --> MW1
    MW3 -->|record| ENG[SyncEngine]
    ENG -->|toOutboxEntry| OB[(Outbox<br/>shopzebra_sync)]
    OB --> FL[Flusher] --> TR[transport] -->|POST| API[Backend API]
    API -->|GET ?since| CU[catchUp]
    CU -->|eventsConfirmed batch| store
    NET[network/app resume] -->|refresh| CU
```

---

## Send path: dispatch → outbox → server

1. A component dispatches an ordinary action (e.g. `shopping/itemChecked`).
2. `eventIdMiddleware` stamps `eventId` (idempotency) and `deviceId` into `meta`.
3. The `withSync` reducer applies it **immediately** to `visible` and appends it to `pending` — optimistic, the UI never waits for the server. `confirmed` stays untouched until the server orders the event.
4. `syncMiddleware` hands the action to `syncEngine.record()`.
5. `toOutboxEntry()` decides **the routing at enqueue time as well** — every entry is uniformly `{ path, wire }`:
   - `meta.remote` set → came from the server, do **not** send it back (`null`).
   - `listCreated` → **class-2 command**: `{ path: '/lists', wire }` with the `ownerId → createdBy` translation into wire format. The server validates and writes the event itself.
   - Slice is `synced` and the action has an aggregate (`aggregateIdOf`) → `{ path: eventsPathFor(id), wire: action }`.
   - Otherwise (e.g. `preferences/*`, hydration actions without an aggregate id) → no sync (`null`).
6. The outbox appends the entry and persists; the flusher is kicked.
7. `sendEntry()` POSTs the head. Response classification:

| Result | Meaning | Reaction |
|---|---|---|
| 2xx `confirmed` | server appended (or deduped via `eventId`) | head leaves the queue; the event stays `pending` in the reducer until catch-up folds it into `confirmed` at its server position |
| network error / 5xx `retry` | transient | head stays, drain again after backoff `min(1s·2ⁿ, 30s)` |
| 4xx `rejected` | rejected on merit (envelope, membership, schema) | head is **dropped for good** — and `pendingDiscarded` rolls its optimistic effect back out of `visible`, so the UI reflects server truth |

```mermaid
sequenceDiagram
    participant C as Component
    participant S as Store (reducer)
    participant E as SyncEngine
    participant O as Outbox
    participant F as Flusher
    participant B as Backend

    C->>S: dispatch(itemChecked)
    Note over S: eventId + deviceId in meta,<br/>state updated immediately (optimistic)
    S->>E: record(action)
    E->>O: enqueue({path, wire})
    O-->>O: persist (shopzebra_sync)
    E->>F: flush()
    loop until queue empty (single-flight)
        F->>B: POST entry.path
        alt 2xx
            B-->>F: confirmed
            F->>O: removeHead() — confirmation folds in later via catch-up
        else network / 5xx
            B-->>F: retry
            F-->>F: backoff 1s→30s, then again
        else 4xx
            B-->>F: rejected
            F->>O: removeHead()
            F->>S: dispatch(pendingDiscarded) — optimistic effect rolled back
        end
    end
```

The drain is **single-flight** (closure guard `draining`): there is never more than one send in flight, because the per-aggregate order must be preserved. Retrying is safe because the server dedupes on `meta.eventId` — a lost ack leads at most to a resend, never to a duplicate log entry.

---

## Receive path: cursor catch-up

There is **no push subscription**. The receive path is exclusively the cursor catch-up — it runs at engine start, on app resume and on network reconnect. (This stays true once AppSync lands: a subscription is only ever a latency optimization, the cursor remains the reliable path — mobile OSes kill background connections, so reconnect catch-up is mandatory anyway.)

```mermaid
sequenceDiagram
    participant T as Trigger<br/>(start / resume / reconnect)
    participant CU as catchUp
    participant B as Backend
    participant O as Outbox
    participant S as Store (withSync)

    T->>CU: refresh()
    CU->>B: GET /lists
    B-->>CU: list ids (membership projection)
    loop per list
        CU->>B: GET /lists/{id}/events?since=<cursor>
        B-->>CU: events (wire format, with meta.position)
        CU-->>CU: sort by position
        CU->>S: dispatch(eventsConfirmed(batch)) — own + foreign events
        Note over S: fold batch into confirmed (position order),<br/>drop acked eventIds from pending,<br/>visible = pending replayed over confirmed (rebase)
        CU->>O: advanceCursor(last position)
    end
    CU->>CU: then flush() — push the outbox
```

Three things here are built this way on purpose:

- **Own events are fetched and folded like everyone else's.** Only that way do they enter `confirmed` at their *server* position — the source of convergence. There is no skip list: the reducer removes them from `pending` by `eventId` in the same step, so nothing double-applies. (`meta.remote: true` on the batched events still stops any echo through the middleware.)
- **The cursor advances only during catch-up, never on ack.** Foreign events may sit between the own cursor and the position of the own confirmed event — if the ack set the cursor, they would never be fetched.
- **No wipe-and-refold.** Local state stays on screen, only the delta behind the cursor folds in on top. Boot is local-first: hydration renders immediately, catch-up runs in the background (`initialSyncCompleted` drives the skeleton cards on fresh devices).

---

## Persistence

Durable sync state is split by ownership:

```jsonc
// shopzebra_sync (Outbox blob)
{
  "queue":               [ /* OutboxEntry[]: { path, wire } — unacked sends */ ],
  "cursorByAggregateId": { "list-abc": "0000000042" }   // last confirmed position per aggregate
}
// shopzebra_lists / shopzebra_shopping (storage handlers)
//   → the CONFIRMED tree, written on every eventsConfirmed
```

The restart round-trip: hydration loads the confirmed blobs into both trees (hydration actions are non-synced, so they apply to `confirmed` and `visible` alike) → `SyncEngine.start()` dispatches `pendingRestored` with the queue's wire actions (translated back to domain form via `domainActionOf`) → the rebase replays them on top. Offline edits survive restarts without ever persisting the optimistic tree.

The `Outbox` class holds its state as an immutable value and serializes writes through a `lastWrite` promise chain — no write overtakes another. A corrupted blob parses to `EMPTY` instead of crashing.

Actions dispatched **before** `start()` has loaded the blob land in the engine's `preStartBuffer` and are enqueued at start — nothing is lost between first render and engine start.

---

## Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Stopped
    Stopped --> Running: startSync()<br/>(boot beforeLoad or performSignIn)
    Running --> Running: networkStatusChange / appStateChange<br/>→ refresh() = catch-up + flush
    Running --> Stopped: stopSync()<br/>(performSignOut)
    note right of Stopped
        stop() clears deps + buffer,
        stopSync() deletes shopzebra_sync —
        no sending under a dead session,
        no inherited outbox for the next user
    end note
```

- `startSync()` is idempotent (`started` guard) — the boot `beforeLoad` and an in-session sign-in may both call it, the engine starts exactly once per session. The guard also absorbs React StrictMode double-invocations.
- The Capacitor listeners are registered **at most once per app lifetime** (`listenersRegistered`), no matter how often the engine is started/stopped — otherwise listeners would stack on every sign-in/out cycle.
- `stopSync()` (on sign-out) stops the engine **first** and then deletes the persisted blob — on a shared device, the next user inherits neither queue nor cursor.

---

## Invariants the engine relies on

These hold project-wide; the engine breaks without them:

- **Reducers are replay-pure.** No `Date.now()`, `crypto.randomUUID()`, `Math.random()` inside a reducer — ids/timestamps are created in the middleware and travel in `meta`/`payload`. The stage-2 rebase folds repeatedly; every replay must be identical.
- **Reducers are total.** An inapplicable event is ignored, never thrown — the log is immutable, and a fold that crashes would break the aggregate for every device permanently.
- **Intention events, no full-state events.** `listRenamed` instead of `listUpdated { name, … }` — full-state clobbers during rebase.
- **Class 2 never goes through the event append.** Anything with a cross-user invariant (`listCreated`, later invites/membership) goes through dedicated command endpoints; the server writes the event. The only exception existing today in `toOutboxEntry` is `listCreated`.

---

## Resolved by stage 2

Three of the former stage-1 limits are gone structurally:

- **Order divergence on concurrent edits** — the rebase folds everyone's events in server-position order; devices converge by construction.
- **Race between flush and catch-up** — folding into `confirmed` and removing from `pending` happen in one atomic reducer step; a confirmation arriving before its own ack is harmless.
- **Silent 4xx effects** — a rejected event's optimistic effect is now rolled back out of `visible` (`pendingDiscarded`); the UI reflects server truth.

## Known limits

1. **Crash window between confirmed-persist and cursor-persist.** The confirmed blobs (storage handlers) and the cursor (outbox) are written independently and fire-and-forget. A crash in between can refetch and re-fold one list's tail into `confirmed` (harmless for id-idempotent events like `listCreated`; `itemAdded` merges quantities by design — a double fold doubles the quantity). Reducers being total keeps this from ever crashing a fold.
2. **The offline winner is "last sync wins"**, not "last edit wins": an offline edit from 2 pm beats an online edit from 3 pm if it syncs at 4 pm. A deliberate trade-off — for concurrent offline edits no true causal order exists, any choice is arbitrary, and the wrong value is visible and one tap away from being fixed.
3. **No real-time receive.** Other devices see changes only on the next catch-up trigger; AppSync is not connected yet (the backend's `EventPublisher` is a noop).
4. **Visible jump on rebase.** When a foreign event slides under own pending events, the UI can visibly reorder — a known, accepted cost of the design, as are the two state trees in memory.
5. **No user notification for discarded events.** The rollback is silent; whether to surface "your offline change was rejected" is an open UX question.

## What comes next

Planned order: property tests (convergence, rebase, ack/dedup, totality — the withSync unit tests cover the core scenarios, property tests would generalize them) → snapshots (the client uploads `fold(log)` as an opaque blob, new devices boot from snapshot + tail) → AppSync real-time receive.
