# Sync-Engine Stufe 1 — Outbox, Cursor, Retry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App wird echt offline-fähig: lokale Änderungen landen in einer persistenten Outbox mit Retry, der Server-Log wird per Cursor (`?since=<position>`) inkrementell nachgeholt statt per Wipe-and-Refold, und die App bootet local-first (State sofort anzeigen, Server-Catch-up im Hintergrund).

**Architecture:** Umsetzung von `architecture/sync-engine.md` §4, Schritt 5 aus §9. Die Engine lebt in `app/sync/` und ist domänen-agnostisch: `synced: true` am Slice ist die einzige Policy (kein `if` pro Action, die Handler-Ketten `listsSyncHandler`/`shoppingSyncHandler` werden gelöscht). Klasse-1-Events gehen generisch an `POST /lists/{listId}/events`, die einzige Klasse-2-Ausnahme (`listCreated` → `POST /lists`) ist explizit gemappt. Kein `withSync`/Rebase — das ist Stufe 2 (§9 Schritt 7).

**Tech Stack:** TypeScript (React/Redux, eigenes `createSlice` ohne Immer), Vitest, `clientStorage`-Wrapper, Capacitor (`@capacitor/network`, `@capacitor/app` neu).

## Global Constraints

Gelten für **jeden** Task (aus `CLAUDE.md` + `architecture/`):

- **NIEMALS bestehende Tests ändern.** Neue Tests sind erlaubt. Wenn ein bestehender Test bricht: STOPP, User informieren (CLAUDE.md Test-Policy, keine Ausnahmen).
- Kein Immer. Reducers schreiben explizite immutable Updates.
- Reducer replay-pur und total: kein `Date.now()`/`crypto.randomUUID()`/`Math.random()` im Reducer; nicht anwendbare Events werden ignoriert, nie geworfen (sync-engine.md §5).
- `const` statt `let` (Ausnahme: dokumentierte Closure-/Instanz-Zustände der Engine), kein `any` (→ `unknown` + Type Guards), kein `as` außer als letzte Option, `readonly` auf allen Properties, `type` statt `interface` für Datenstrukturen.
- Kommentare im Code **auf Englisch**.
- Kein `localStorage` direkt — alles über den `clientStorage`-Wrapper. (Der geplante Preferences→Filesystem-Swap im Wrapper-Inneren ist bewusst NICHT Teil dieses Plans — er ändert nur das Wrapper-Backend, nicht die Aufrufer.)
- `app/sync/` importiert keine UI; kein Feature importiert aus `app/sync/` (sync-engine.md §4: „Kein Feature importiert daraus").
- Wire-Format ist die Redux-Action selbst: `{ type, payload, meta }` (domain-model.md §8).
- Nach jedem Task: `npx prettier --write <geänderte Dateien>`, `pnpm build` grün, `pnpm test` grün (alle Kommandos in `apps/mobile/`).
- Backend wird NICHT angefasst (kein `cdk synth` nötig).

**Backend-Contracts (existieren bereits, nur konsumieren):**

- `POST /lists/{listId}/events` mit Body `{ type, payload, meta: { eventId, deviceId } }` → `200 { "position": "0000…N", "eventId": "…" }`. Idempotent über `meta.eventId` (erneutes Senden desselben Events ist harmlos). `403` fehlende Membership, `400`/`422` Envelope/Schema-Ablehnung, `5xx` transient.
- `GET /lists/{listId}/events?since=<position>` → `{ "events": [ { type, payload, meta: { eventId, deviceId, userId, position } } ] }` in Server-Ordnung. Ohne `since`: kompletter Log.
- `GET /lists` → `{ "lists": [ "<listId>", … ] }`.
- `POST /lists` (Klasse-2-Command) mit Wire-Payload `{ listId, name, createdBy }`.
- Position: zero-padded 20-stelliger String — String-Vergleich = numerischer Vergleich.

---

## File Structure (Ziel)

```
apps/mobile/src/app/
  createSlice.ts        # MODIFY: synced-Flag + Registry, ActionMeta um position/userId erweitert
  appSlice.ts           # MODIFY: initialSyncDone-Flag
  router.ts             # MODIFY: local-first Boot, startSync() im Hintergrund
  serverBootstrap.ts    # DELETE (ersetzt durch sync/catchUp.ts)
  syncMiddleware.ts     # MODIFY: nur noch Enqueue-Effect, Handler-Ketten weg
  sync/
    outbox.ts           # NEW: persistente Queue + Cursor pro Liste + applied-Dedup
    transport.ts        # NEW: sendEntry / fetchListIds / fetchEventsSince
    syncedActions.ts    # NEW: toOutboxEntry (Policy + Klasse-2-Mapping), toLocalAction
    flush.ts            # NEW: Drain-Loop mit Backoff
    catchUp.ts          # NEW: Cursor-Catch-up + Fold
    syncEngine.ts       # NEW: Singleton, startSync, Reconnect-Trigger
apps/mobile/src/features/lists/domain/listsSyncHandler.ts      # DELETE
apps/mobile/src/features/shopping/domain/shoppingSyncHandler.ts # DELETE
apps/mobile/src/features/lists/overview/ListsPage.tsx           # MODIFY: Skeleton-Tiles solange initial sync läuft
apps/mobile/src/features/lists/overview/ListsPageSkeleton.tsx   # MODIFY: ListCardSkeleton exportieren
```

Alle Pfade unten relativ zu `apps/mobile/` sofern nicht anders angegeben. Alle Test-Kommandos laufen in `apps/mobile/`.

---

### Task 1: `synced`-Flag am Slice + ActionMeta-Erweiterung

**Files:**
- Modify: `src/app/createSlice.ts`
- Modify: `src/features/lists/domain/listsSlice.ts` (nur `synced: true` in der Config)
- Modify: `src/features/shopping/domain/shoppingSlice.ts` (nur `synced: true` in der Config)
- Test: `src/app/createSlice.test.ts` (NEU)

**Interfaces:**
- Produces: `isSyncedActionType(type: string): boolean` — true wenn der Slice-Prefix (`lists`, `shopping`) als synced registriert ist. `ActionMeta` bekommt optionale Felder `position?: string` und `userId?: string` (Server-Meta beim Fold).
- Wichtig: `createSlice`-Rückgabe (`{ actions, reducer }`) bleibt unverändert — bestehende Slice-Tests dürfen nicht brechen.

- [ ] **Step 1: Failing Test schreiben**

```ts
// src/app/createSlice.test.ts
import { describe, expect, it } from 'vitest'
import { createSlice, isSyncedActionType } from './createSlice'

describe('synced slices', () => {
  it('registers synced slices for the outbox policy', () => {
    createSlice({
      name: 'syncedDemo',
      initialState: {},
      reducers: {},
      synced: true,
    })
    createSlice({ name: 'localDemo', initialState: {}, reducers: {} })

    expect(isSyncedActionType('syncedDemo/somethingHappened')).toBe(true)
    expect(isSyncedActionType('localDemo/somethingHappened')).toBe(false)
    expect(isSyncedActionType('unknown/action')).toBe(false)
  })
})
```

- [ ] **Step 2: Test läuft rot**

Run: `pnpm test 2>&1 | tail -20`
Expected: FAIL — `isSyncedActionType` existiert nicht / `synced` unbekannte Property.

- [ ] **Step 3: Implementieren**

In `src/app/createSlice.ts`:

`ActionMeta` erweitern (nur optionale Felder anhängen):

```ts
export type ActionMeta = {
  /** Unique per dispatch. Used as part of the DynamoDB sort key for server-side idempotency. */
  readonly eventId: string
  /** Originating device. Used to filter out own events when syncing from the server. */
  readonly deviceId: string
  /** Set by fromServer() for events received from the backend. SyncMiddleware skips these. */
  readonly remote?: boolean
  /** Server-assigned log position — present only on events folded from the server. */
  readonly position?: string
  /** JWT-derived author — present only on events folded from the server. */
  readonly userId?: string
}
```

Registry + Policy-Funktion (vor `createSlice`):

```ts
// The only sync policy: a slice opts in with `synced: true` and every
// action of that slice becomes a candidate for the outbox
// (sync-engine.md §3 — one boolean per slice, no per-action ifs).
const syncedSliceNames = new Set<string>()

export function isSyncedActionType(type: string): boolean {
  const sliceName = type.split('/')[0]
  return sliceName !== undefined && syncedSliceNames.has(sliceName)
}
```

Config-Parameter ergänzen (`synced?: boolean` in das Config-Objekt von `createSlice`) und im Funktionskörper als erstes:

```ts
  if (config.synced) syncedSliceNames.add(config.name)
```

In `listsSlice.ts` und `shoppingSlice.ts` jeweils `synced: true,` in die `createSlice`-Config aufnehmen (direkt unter `name:`). Sonst nichts ändern.

- [ ] **Step 4: Tests laufen grün (alle, nicht nur der neue)**

Run: `pnpm test 2>&1 | tail -5`
Expected: alle Test-Files PASS (34 Bestandstests + neuer).

- [ ] **Step 5: Build + Commit**

```bash
npx prettier --write src/app/createSlice.ts src/app/createSlice.test.ts src/features/lists/domain/listsSlice.ts src/features/shopping/domain/shoppingSlice.ts
pnpm build
git add -A && git commit -m "feat(sync): synced flag on slices as the single outbox policy"
```

---

### Task 2: Outbox — persistente Queue, Cursor, Dedup

**Files:**
- Create: `src/app/sync/outbox.ts`
- Test: `src/app/sync/outbox.test.ts`

**Interfaces:**
- Consumes: `PayloadAction` aus `../createSlice`.
- Produces (von allen späteren Tasks benutzt):

```ts
export type QueuedEvent = {
  readonly kind: 'event'
  readonly listId: string
  readonly action: PayloadAction<unknown>
}
export type QueuedCommand = {
  readonly kind: 'command'
  readonly path: string
  readonly wire: PayloadAction<unknown>
}
export type OutboxEntry = QueuedEvent | QueuedCommand

export type SyncStorage = {
  readonly getItem: (key: string) => Promise<string | null>
  readonly setItem: (key: string, value: string) => Promise<void>
}

export class Outbox {
  static load(storage: SyncStorage): Promise<Outbox>
  head(): OutboxEntry | null
  size(): number
  enqueue(entry: OutboxEntry): Promise<void>
  confirmHead(): Promise<void>
  dropHead(): Promise<void>
  cursorFor(listId: string): string | null
  hasApplied(eventId: string): boolean
  advanceCursor(listId: string, position: string, passedEventIds: readonly string[]): Promise<void>
}
export function entryEventId(entry: OutboxEntry): string
```

**Semantik (der Kern von Stufe 1):**
- FIFO-Queue, ein JSON-Blob unter Key `shopzebra_sync` via `SyncStorage` (Produktion: der `clientStorage`-Wrapper). Überlebt App-Neustart.
- `confirmHead()` entfernt den Head UND merkt seine `eventId` in `appliedEventIds` — damit der Catch-up das eigene Event beim Zurücklesen vom Server **nicht doppelt faltet** (sync-engine.md §4 „Dedup per eventId"). Der Cursor wird beim Ack bewusst NICHT bewegt (zwischen Cursor und Ack-Position können fremde Events liegen).
- `advanceCursor(listId, position, passedEventIds)` setzt den Cursor und **prunt** alle `appliedEventIds`, die in `passedEventIds` enthalten sind — die Menge bleibt dadurch beschränkt.
- `dropHead()` entfernt den Head OHNE applied-Eintrag (fachliche 4xx-Ablehnung: das Event existiert auf dem Server nicht).
- Schreiben ist über eine interne Promise-Kette serialisiert — zwei schnelle `enqueue` dürfen sich nicht gegenseitig überschreiben.
- Korrupter/fehlender Storage-Inhalt → leerer Zustand (kein Throw).

- [ ] **Step 1: Failing Tests schreiben**

```ts
// src/app/sync/outbox.test.ts
import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '../createSlice'
import { Outbox, entryEventId, type OutboxEntry, type SyncStorage } from './outbox'

function memoryStorage(initial?: string): SyncStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set('shopzebra_sync', initial)
  return {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

function eventEntry(eventId: string, listId = 'list-1'): OutboxEntry {
  const action: PayloadAction<unknown> = {
    type: 'shopping/itemAdded',
    payload: { listId, itemId: 'apples' },
    meta: { eventId, deviceId: 'device-1' },
  }
  return { kind: 'event', listId, action }
}

describe('Outbox', () => {
  it('starts empty and queues FIFO', async () => {
    const outbox = await Outbox.load(memoryStorage())
    expect(outbox.head()).toBeNull()
    await outbox.enqueue(eventEntry('e1'))
    await outbox.enqueue(eventEntry('e2'))
    expect(outbox.size()).toBe(2)
    expect(entryEventId(outbox.head()!)).toBe('e1')
  })

  it('survives a reload from the same storage', async () => {
    const storage = memoryStorage()
    const first = await Outbox.load(storage)
    await first.enqueue(eventEntry('e1'))
    const second = await Outbox.load(storage)
    expect(second.size()).toBe(1)
    expect(entryEventId(second.head()!)).toBe('e1')
  })

  it('confirmHead removes the head and records it as applied', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(eventEntry('e1'))
    await outbox.confirmHead()
    expect(outbox.head()).toBeNull()
    expect(outbox.hasApplied('e1')).toBe(true)
  })

  it('dropHead removes the head without an applied record', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(eventEntry('e1'))
    await outbox.dropHead()
    expect(outbox.head()).toBeNull()
    expect(outbox.hasApplied('e1')).toBe(false)
  })

  it('advanceCursor sets the cursor and prunes passed applied ids', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(eventEntry('e1'))
    await outbox.confirmHead()
    expect(outbox.cursorFor('list-1')).toBeNull()
    await outbox.advanceCursor('list-1', '00000000000000000042', ['e1'])
    expect(outbox.cursorFor('list-1')).toBe('00000000000000000042')
    expect(outbox.hasApplied('e1')).toBe(false)
  })

  it('falls back to empty state on corrupted storage', async () => {
    const outbox = await Outbox.load(memoryStorage('{not json'))
    expect(outbox.head()).toBeNull()
    expect(outbox.size()).toBe(0)
  })
})
```

- [ ] **Step 2: Test läuft rot**

Run: `pnpm test 2>&1 | tail -20`
Expected: FAIL — Modul `./outbox` existiert nicht.

- [ ] **Step 3: Implementieren**

```ts
// src/app/sync/outbox.ts
// Persistent send queue + per-aggregate cursor + eventId dedup —
// the durable core of sync engine stage 1 (sync-engine.md §4).
//
// The cursor deliberately does NOT advance on ack: foreign events may
// sit between the cursor and the acked position. Catch-up advances it
// and prunes the applied set once it has folded past those positions.

import type { PayloadAction } from '../createSlice'

export type QueuedEvent = {
  readonly kind: 'event'
  readonly listId: string
  readonly action: PayloadAction<unknown>
}

export type QueuedCommand = {
  readonly kind: 'command'
  readonly path: string
  readonly wire: PayloadAction<unknown>
}

export type OutboxEntry = QueuedEvent | QueuedCommand

export type SyncStorage = {
  readonly getItem: (key: string) => Promise<string | null>
  readonly setItem: (key: string, value: string) => Promise<void>
}

export function entryEventId(entry: OutboxEntry): string {
  const meta = entry.kind === 'event' ? entry.action.meta : entry.wire.meta
  return meta?.eventId ?? ''
}

type PersistedSync = {
  readonly queue: readonly OutboxEntry[]
  readonly cursorByListId: { readonly [listId: string]: string }
  readonly appliedEventIds: readonly string[]
}

const SYNC_STORAGE_KEY = 'shopzebra_sync'

const EMPTY: PersistedSync = {
  queue: [],
  cursorByListId: {},
  appliedEventIds: [],
}

function parsePersisted(raw: string | null): PersistedSync {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return EMPTY
    const candidate = parsed as Partial<PersistedSync>
    return {
      queue: Array.isArray(candidate.queue) ? candidate.queue : [],
      cursorByListId:
        candidate.cursorByListId !== null &&
        typeof candidate.cursorByListId === 'object'
          ? candidate.cursorByListId
          : {},
      appliedEventIds: Array.isArray(candidate.appliedEventIds)
        ? candidate.appliedEventIds
        : [],
    }
  } catch {
    return EMPTY
  }
}

export class Outbox {
  // Mutable by design: this is infrastructure state behind an
  // immutable-value API. Writes are serialized through `lastWrite`.
  private state: PersistedSync
  private lastWrite: Promise<void> = Promise.resolve()

  private constructor(
    private readonly storage: SyncStorage,
    initial: PersistedSync,
  ) {
    this.state = initial
  }

  static async load(storage: SyncStorage): Promise<Outbox> {
    const raw = await storage.getItem(SYNC_STORAGE_KEY)
    return new Outbox(storage, parsePersisted(raw))
  }

  head(): OutboxEntry | null {
    return this.state.queue[0] ?? null
  }

  size(): number {
    return this.state.queue.length
  }

  enqueue(entry: OutboxEntry): Promise<void> {
    return this.commit({
      ...this.state,
      queue: [...this.state.queue, entry],
    })
  }

  confirmHead(): Promise<void> {
    const confirmed = this.head()
    if (!confirmed) return Promise.resolve()
    return this.commit({
      ...this.state,
      queue: this.state.queue.slice(1),
      appliedEventIds: [...this.state.appliedEventIds, entryEventId(confirmed)],
    })
  }

  dropHead(): Promise<void> {
    if (!this.head()) return Promise.resolve()
    return this.commit({ ...this.state, queue: this.state.queue.slice(1) })
  }

  cursorFor(listId: string): string | null {
    return this.state.cursorByListId[listId] ?? null
  }

  hasApplied(eventId: string): boolean {
    return this.state.appliedEventIds.includes(eventId)
  }

  advanceCursor(
    listId: string,
    position: string,
    passedEventIds: readonly string[],
  ): Promise<void> {
    const passed = new Set(passedEventIds)
    return this.commit({
      ...this.state,
      cursorByListId: { ...this.state.cursorByListId, [listId]: position },
      appliedEventIds: this.state.appliedEventIds.filter(
        (id) => !passed.has(id),
      ),
    })
  }

  private commit(next: PersistedSync): Promise<void> {
    this.state = next
    this.lastWrite = this.lastWrite.then(() =>
      this.storage.setItem(SYNC_STORAGE_KEY, JSON.stringify(this.state)),
    )
    return this.lastWrite
  }
}
```

- [ ] **Step 4: Tests laufen grün**

Run: `pnpm test 2>&1 | tail -5`
Expected: alle PASS.

- [ ] **Step 5: Build + Commit**

```bash
npx prettier --write src/app/sync/outbox.ts src/app/sync/outbox.test.ts
pnpm build
git add -A && git commit -m "feat(sync): persistent outbox with per-list cursor and eventId dedup"
```

---

### Task 3: Transport — HTTP-Kante mit klassifizierten Ergebnissen

**Files:**
- Create: `src/app/sync/transport.ts`
- Test: `src/app/sync/transport.test.ts`

**Interfaces:**
- Consumes: `OutboxEntry` aus `./outbox`, `authFetch` aus `../authFetch`.
- Produces:

```ts
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
export type SendResult =
  | { readonly outcome: 'confirmed' }
  | { readonly outcome: 'retry' }
  | { readonly outcome: 'rejected'; readonly status: number }
export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export function sendEntry(entry: OutboxEntry, fetcher?: Fetcher): Promise<SendResult>
export function fetchListIds(fetcher?: Fetcher): Promise<readonly string[]>
export function fetchEventsSince(listId: string, since: string | null, fetcher?: Fetcher): Promise<readonly WireEvent[]>
```

**Semantik:**
- `sendEntry`: `kind: 'event'` → `POST /lists/{listId}/events` mit `{ type, payload, meta }` der Action; `kind: 'command'` → `POST {entry.path}` mit `entry.wire`. `response.ok` → `confirmed`. Status 400–499 → `rejected` (fachliche Ablehnung, kein Retry). Status ≥ 500 oder geworfene Exception (Netzwerk) → `retry`. Der Server ist über `meta.eventId` idempotent — ein Resend nach verlorenem Ack ist harmlos und kommt als `confirmed` zurück.
- `fetchListIds` / `fetchEventsSince`: dünne Wrapper um die bestehenden Endpunkte; Nicht-OK-Antworten und kaputte Bodies werfen (der Aufrufer — Catch-up — fängt pro Liste).
- Default-`fetcher` ist `authFetch`; Tests injizieren einen Fake.

- [ ] **Step 1: Failing Tests schreiben**

```ts
// src/app/sync/transport.test.ts
import { describe, expect, it } from 'vitest'
import type { OutboxEntry } from './outbox'
import { fetchEventsSince, fetchListIds, sendEntry, type Fetcher } from './transport'

const entry: OutboxEntry = {
  kind: 'event',
  listId: 'list-1',
  action: {
    type: 'shopping/itemAdded',
    payload: { listId: 'list-1', itemId: 'apples' },
    meta: { eventId: 'e1', deviceId: 'device-1' },
  },
}

function respondingWith(status: number, body: unknown): Fetcher {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

describe('sendEntry', () => {
  it('posts an event to its list log and confirms on 200', async () => {
    const calls: string[] = []
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(
        new Response(JSON.stringify({ position: '00000000000000000007', eventId: 'e1' }), { status: 200 }),
      )
    }
    const result = await sendEntry(entry, fetcher)
    expect(result).toEqual({ outcome: 'confirmed' })
    expect(calls).toEqual(['/lists/list-1/events'])
  })

  it('posts a command to its own path', async () => {
    const calls: string[] = []
    const command: OutboxEntry = {
      kind: 'command',
      path: '/lists',
      wire: {
        type: 'lists/listCreated',
        payload: { listId: 'l1', name: 'REWE', createdBy: 'user-1' },
        meta: { eventId: 'e9', deviceId: 'device-1' },
      },
    }
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    await sendEntry(command, fetcher)
    expect(calls).toEqual(['/lists'])
  })

  it('classifies 4xx as rejected and 5xx as retry', async () => {
    expect(await sendEntry(entry, respondingWith(403, {}))).toEqual({ outcome: 'rejected', status: 403 })
    expect(await sendEntry(entry, respondingWith(503, {}))).toEqual({ outcome: 'retry' })
  })

  it('classifies network errors as retry', async () => {
    const offline: Fetcher = () => Promise.reject(new Error('offline'))
    expect(await sendEntry(entry, offline)).toEqual({ outcome: 'retry' })
  })
})

describe('catch-up fetchers', () => {
  it('fetchListIds returns the id list', async () => {
    const ids = await fetchListIds(respondingWith(200, { lists: ['a', 'b'] }))
    expect(ids).toEqual(['a', 'b'])
  })

  it('fetchEventsSince appends the cursor as query parameter', async () => {
    const calls: string[] = []
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(new Response(JSON.stringify({ events: [] }), { status: 200 }))
    }
    await fetchEventsSince('list-1', '00000000000000000005', fetcher)
    await fetchEventsSince('list-1', null, fetcher)
    expect(calls).toEqual([
      '/lists/list-1/events?since=00000000000000000005',
      '/lists/list-1/events',
    ])
  })

  it('fetchEventsSince throws on a non-ok response', async () => {
    await expect(fetchEventsSince('list-1', null, respondingWith(500, {}))).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Test läuft rot**

Run: `pnpm test 2>&1 | tail -20`
Expected: FAIL — Modul `./transport` existiert nicht.

- [ ] **Step 3: Implementieren**

```ts
// src/app/sync/transport.ts
// The HTTP edge of the sync engine. Classifies outcomes so the flush
// loop can decide: retry (network/5xx), drop (4xx rejection) or done.
// The server dedupes on meta.eventId, so resending after a lost ack
// is safe (sync-engine.md §4).

import { authFetch } from '../authFetch'
import { type OutboxEntry } from './outbox'

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

export type SendResult =
  | { readonly outcome: 'confirmed' }
  | { readonly outcome: 'retry' }
  | { readonly outcome: 'rejected'; readonly status: number }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

function isWireEvent(candidate: unknown): candidate is WireEvent {
  if (candidate === null || typeof candidate !== 'object') return false
  const event = candidate as {
    readonly type?: unknown
    readonly payload?: unknown
    readonly meta?: { readonly eventId?: unknown; readonly position?: unknown }
  }
  return (
    typeof event.type === 'string' &&
    typeof event.payload === 'object' &&
    typeof event.meta?.eventId === 'string' &&
    typeof event.meta?.position === 'string'
  )
}

export async function sendEntry(
  entry: OutboxEntry,
  fetcher: Fetcher = authFetch,
): Promise<SendResult> {
  const path = entry.kind === 'event' ? `/lists/${entry.listId}/events` : entry.path
  const wire = entry.kind === 'event' ? entry.action : entry.wire
  try {
    const response = await fetcher(path, {
      method: 'POST',
      body: JSON.stringify({ type: wire.type, payload: wire.payload, meta: wire.meta }),
    })
    if (response.ok) return { outcome: 'confirmed' }
    if (response.status >= 400 && response.status < 500) {
      return { outcome: 'rejected', status: response.status }
    }
    return { outcome: 'retry' }
  } catch {
    return { outcome: 'retry' }
  }
}

export async function fetchListIds(
  fetcher: Fetcher = authFetch,
): Promise<readonly string[]> {
  const response = await fetcher('/lists')
  if (!response.ok) throw new Error(`GET /lists → ${response.status}`)
  const body: unknown = await response.json()
  const lists = (body as { readonly lists?: unknown }).lists
  if (!Array.isArray(lists)) throw new Error('lists response is not a list')
  return lists.filter((id): id is string => typeof id === 'string')
}

export async function fetchEventsSince(
  listId: string,
  since: string | null,
  fetcher: Fetcher = authFetch,
): Promise<readonly WireEvent[]> {
  const query = since ? `?since=${since}` : ''
  const response = await fetcher(`/lists/${listId}/events${query}`)
  if (!response.ok) {
    throw new Error(`GET /lists/${listId}/events → ${response.status}`)
  }
  const body: unknown = await response.json()
  const events = (body as { readonly events?: unknown }).events
  if (!Array.isArray(events)) throw new Error('events response is not a list')
  return events.filter(isWireEvent)
}
```

Hinweis: `authFetch` hat evtl. eine engere Signatur als `Fetcher` — prüfen (`src/app/authFetch.ts`) und `Fetcher` exakt an die tatsächliche Signatur angleichen (Pfad + `RequestInit`), NICHT `authFetch` ändern.

- [ ] **Step 4: Tests laufen grün**

Run: `pnpm test 2>&1 | tail -5`

- [ ] **Step 5: Build + Commit**

```bash
npx prettier --write src/app/sync/transport.ts src/app/sync/transport.test.ts
pnpm build
git add -A && git commit -m "feat(sync): transport edge with retry/reject classification"
```

---

### Task 4: `syncedActions` — Policy-Mapping in beide Richtungen

**Files:**
- Create: `src/app/sync/syncedActions.ts`
- Test: `src/app/sync/syncedActions.test.ts`

**Interfaces:**
- Consumes: `isSyncedActionType`, `PayloadAction` (Task 1), `OutboxEntry` (Task 2), `WireEvent` (Task 3), `listCreated` aus `features/lists/domain/listsSlice`.
- Produces:

```ts
export function toOutboxEntry(action: PayloadAction<unknown>): OutboxEntry | null
export function toLocalAction(event: WireEvent): PayloadAction<unknown>
```

**Semantik:**
- `toOutboxEntry` (Senderichtung): `meta.remote` → `null`. `listCreated` → `QueuedCommand` mit Pfad `/lists` und Wire-Payload `{ listId, name, createdBy }` (Klasse 2, services/events.md — die einzige Ausnahme vom generischen Pfad). Sonst: Slice synced (`isSyncedActionType`) UND `payload.listId` ist ein String → `QueuedEvent`. Alles andere → `null`. Damit sind `listsLoaded`/`shoppingLoaded` (kein `listId` im Payload) automatisch draußen.
- `toLocalAction` (Empfangsrichtung, ersetzt die Logik aus `serverBootstrap.ts`): setzt `meta.remote: true` (damit `eventIdMiddleware` die Identität erhält und `syncMiddleware` nicht zurücksendet) und mappt bei `lists/listCreated` das Wire-Feld `createdBy` auf das Domain-Feld `ownerId`.

- [ ] **Step 1: Failing Tests schreiben**

```ts
// src/app/sync/syncedActions.test.ts
import { describe, expect, it } from 'vitest'
import { toLocalAction, toOutboxEntry } from './syncedActions'
import { itemAdded } from '../../features/shopping/domain/shoppingSlice'
import { listCreated } from '../../features/lists/domain/listsSlice'
import type { WireEvent } from './transport'

const meta = { eventId: 'e1', deviceId: 'device-1' }

describe('toOutboxEntry', () => {
  it('maps a synced class-1 action to its list log', () => {
    const action = {
      ...itemAdded({
        listId: 'list-1',
        itemId: 'apples',
        name: 'Äpfel',
        quantity: 1,
        unit: 'kg',
        category: 'produce',
        addedBy: 'user-1',
      }),
      meta,
    }
    const entry = toOutboxEntry(action)
    expect(entry).toEqual({ kind: 'event', listId: 'list-1', action })
  })

  it('maps listCreated to the class-2 command endpoint with createdBy', () => {
    const action = {
      ...listCreated({ listId: 'l1', name: 'REWE', ownerId: 'user-1' }),
      meta,
    }
    const entry = toOutboxEntry(action)
    expect(entry).toEqual({
      kind: 'command',
      path: '/lists',
      wire: {
        type: 'lists/listCreated',
        payload: { listId: 'l1', name: 'REWE', createdBy: 'user-1' },
        meta,
      },
    })
  })

  it('ignores remote actions, unsynced slices and payloads without listId', () => {
    const remote = { type: 'shopping/itemAdded', payload: { listId: 'l1' }, meta: { ...meta, remote: true } }
    expect(toOutboxEntry(remote)).toBeNull()
    expect(toOutboxEntry({ type: 'preferences/themeChanged', payload: { listId: 'l1' }, meta })).toBeNull()
    expect(toOutboxEntry({ type: 'lists/listsLoaded', payload: { lists: [] }, meta })).toBeNull()
  })
})

describe('toLocalAction', () => {
  const wireMeta = { eventId: 'e1', deviceId: 'other', userId: 'u2', position: '00000000000000000003' }

  it('marks events as remote so they are not sent back', () => {
    const event: WireEvent = { type: 'shopping/itemChecked', payload: { listId: 'l1', itemId: 'x' }, meta: wireMeta }
    expect(toLocalAction(event)).toEqual({
      type: 'shopping/itemChecked',
      payload: { listId: 'l1', itemId: 'x' },
      meta: { ...wireMeta, remote: true },
    })
  })

  it('translates createdBy back to ownerId for listCreated', () => {
    const event: WireEvent = { type: 'lists/listCreated', payload: { listId: 'l1', name: 'REWE', createdBy: 'u2' }, meta: wireMeta }
    expect(toLocalAction(event).payload).toEqual({ listId: 'l1', name: 'REWE', ownerId: 'u2' })
  })
})
```

- [ ] **Step 2: Test läuft rot**

Run: `pnpm test 2>&1 | tail -20`

- [ ] **Step 3: Implementieren**

```ts
// src/app/sync/syncedActions.ts
// Policy edge of the engine: which dispatched actions enter the outbox
// (and as what), and how server events become local actions again.
// The class-2 exception list is intentionally tiny and explicit
// (sync-engine.md §6) — everything else rides the generic path.

import { isSyncedActionType, type PayloadAction } from '../createSlice'
import { listCreated } from '../../features/lists/domain/listsSlice'
import type { OutboxEntry } from './outbox'
import type { WireEvent } from './transport'

function aggregateListId(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object') return null
  const value = (payload as { readonly listId?: unknown }).listId
  return typeof value === 'string' ? value : null
}

export function toOutboxEntry(action: PayloadAction<unknown>): OutboxEntry | null {
  if (action.meta?.remote) return null

  // Class-2 command: the server claims ownership and writes the event
  // itself — the wire names the creator `createdBy` (services/events.md).
  if (listCreated.match(action)) {
    const { listId, name, ownerId } = action.payload
    return {
      kind: 'command',
      path: '/lists',
      wire: {
        type: listCreated.type,
        payload: { listId, name, createdBy: ownerId },
        meta: action.meta,
      },
    }
  }

  if (!isSyncedActionType(action.type)) return null
  const listId = aggregateListId(action.payload)
  if (!listId) return null
  return { kind: 'event', listId, action }
}

export function toLocalAction(event: WireEvent): PayloadAction<unknown> {
  const payload =
    event.type === listCreated.type
      ? translateCreatedBy(event.payload)
      : event.payload
  // remote: true — syncMiddleware must not post it back and
  // eventIdMiddleware must keep the original identity.
  return { type: event.type, payload, meta: { ...event.meta, remote: true } }
}

function translateCreatedBy(payload: Record<string, unknown>): Record<string, unknown> {
  const { createdBy, ...rest } = payload
  return { ...rest, ownerId: createdBy }
}
```

- [ ] **Step 4: Tests laufen grün** — `pnpm test 2>&1 | tail -5`

- [ ] **Step 5: Build + Commit**

```bash
npx prettier --write src/app/sync/syncedActions.ts src/app/sync/syncedActions.test.ts
pnpm build
git add -A && git commit -m "feat(sync): generic outbox mapping with explicit class-2 exception"
```

---

### Task 5: Flush-Loop mit Backoff

**Files:**
- Create: `src/app/sync/flush.ts`
- Test: `src/app/sync/flush.test.ts`

**Interfaces:**
- Consumes: `Outbox`, `OutboxEntry`, `entryEventId` (Task 2), `SendResult` (Task 3).
- Produces:

```ts
export type Flusher = { readonly flush: () => void }
export function createFlusher(
  outbox: Outbox,
  send: (entry: OutboxEntry) => Promise<SendResult>,
): Flusher
```

**Semantik:**
- `flush()` startet den Drain, wenn keiner läuft (Single-Flight — nie zwei parallele Sender, sonst bricht die Reihenfolge pro Aggregate).
- Drain: solange ein Head existiert → `send(head)`. `confirmed` → `confirmHead()`, Backoff-Zähler zurücksetzen, weiter. `rejected` → `console.warn` + `dropHead()` (fachlich abgelehnt verlässt die Queue endgültig — sync-engine.md §4 „Ablehnung statt Endlos-Retry"), weiter. `retry` → `setTimeout(drain, backoff)` mit Exponential-Backoff 1s, 2s, 4s … max 30s, Drain endet (der Timer startet ihn neu; ein zwischenzeitliches `flush()` — z. B. durch Reconnect — darf sofort erneut versuchen).

- [ ] **Step 1: Failing Tests schreiben**

```ts
// src/app/sync/flush.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadAction } from '../createSlice'
import { Outbox, type OutboxEntry, type SyncStorage } from './outbox'
import type { SendResult } from './transport'
import { createFlusher } from './flush'

function memoryStorage(): SyncStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

function entry(eventId: string): OutboxEntry {
  const action: PayloadAction<unknown> = {
    type: 'shopping/itemAdded',
    payload: { listId: 'l1' },
    meta: { eventId, deviceId: 'd1' },
  }
  return { kind: 'event', listId: 'l1', action }
}

async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

describe('createFlusher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('drains the queue in order on success', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('e1'))
    await outbox.enqueue(entry('e2'))
    const sent: string[] = []
    const flusher = createFlusher(outbox, (queued) => {
      sent.push(queued.kind === 'event' ? (queued.action.meta?.eventId ?? '') : '')
      return Promise.resolve<SendResult>({ outcome: 'confirmed' })
    })
    flusher.flush()
    await flushMicrotasks()
    expect(sent).toEqual(['e1', 'e2'])
    expect(outbox.size()).toBe(0)
  })

  it('drops rejected entries and continues with the next', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('bad'))
    await outbox.enqueue(entry('good'))
    const results: SendResult[] = [
      { outcome: 'rejected', status: 422 },
      { outcome: 'confirmed' },
    ]
    const flusher = createFlusher(outbox, () => Promise.resolve(results.shift()!))
    flusher.flush()
    await flushMicrotasks()
    expect(outbox.size()).toBe(0)
    expect(outbox.hasApplied('bad')).toBe(false)
    expect(outbox.hasApplied('good')).toBe(true)
  })

  it('retries with exponential backoff and keeps the entry at the head', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('e1'))
    let attempts = 0
    const flusher = createFlusher(outbox, () => {
      attempts += 1
      return Promise.resolve<SendResult>(
        attempts < 3 ? { outcome: 'retry' } : { outcome: 'confirmed' },
      )
    })
    flusher.flush()
    await flushMicrotasks()
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(attempts).toBe(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(attempts).toBe(3)
    expect(outbox.size()).toBe(0)
  })
})
```

- [ ] **Step 2: Test läuft rot** — `pnpm test 2>&1 | tail -20`

- [ ] **Step 3: Implementieren**

```ts
// src/app/sync/flush.ts
// Single-flight drain of the outbox. Order matters per aggregate, so
// there is never more than one send in flight. Retry only on network
// and 5xx; a 4xx rejection leaves the queue for good — otherwise one
// rejected event blocks the queue forever (sync-engine.md §4).

import { Outbox, entryEventId, type OutboxEntry } from './outbox'
import type { SendResult } from './transport'

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

export type Flusher = { readonly flush: () => void }

export function createFlusher(
  outbox: Outbox,
  send: (entry: OutboxEntry) => Promise<SendResult>,
): Flusher {
  // Closure state by design: single-flight guard and backoff level.
  let draining = false
  let failedAttempts = 0

  async function drain(): Promise<void> {
    if (draining) return
    draining = true
    try {
      for (let head = outbox.head(); head !== null; head = outbox.head()) {
        const result = await send(head)
        if (result.outcome === 'retry') {
          const delay = Math.min(
            RETRY_BASE_MS * 2 ** failedAttempts,
            RETRY_MAX_MS,
          )
          failedAttempts += 1
          setTimeout(() => void drain(), delay)
          return
        }
        failedAttempts = 0
        if (result.outcome === 'rejected') {
          console.warn(
            `sync: server rejected ${entryEventId(head)} (${result.status}) — dropped`,
          )
          await outbox.dropHead()
        } else {
          await outbox.confirmHead()
        }
      }
    } finally {
      draining = false
    }
  }

  return { flush: () => void drain() }
}
```

Achtung Detail: `draining = false` muss im `finally` VOR dem Timer-Callback wirken — der Timer ruft `drain()` neu auf und darf nicht am Guard scheitern. Der obige Code erfüllt das (das `return` im Retry-Zweig läuft durchs `finally`).

- [ ] **Step 4: Tests laufen grün** — `pnpm test 2>&1 | tail -5`

- [ ] **Step 5: Build + Commit**

```bash
npx prettier --write src/app/sync/flush.ts src/app/sync/flush.test.ts
pnpm build
git add -A && git commit -m "feat(sync): single-flight flush loop with exponential backoff"
```

---

### Task 6: Catch-up — Cursor-Nachholen statt Wipe-and-Refold

**Files:**
- Create: `src/app/sync/catchUp.ts`
- Test: `src/app/sync/catchUp.test.ts`

**Interfaces:**
- Consumes: `Outbox` (Task 2), `WireEvent` (Task 3), `toLocalAction` (Task 4).
- Produces:

```ts
export type CatchUpDeps = {
  readonly outbox: Outbox
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly fetchListIds: () => Promise<readonly string[]>
  readonly fetchEventsSince: (listId: string, since: string | null) => Promise<readonly WireEvent[]>
}
export function catchUp(deps: CatchUpDeps): Promise<void>
```

**Semantik:**
- `GET /lists` → pro Liste `fetchEventsSince(listId, cursor)`; Events nach `meta.position` sortieren (String-Sort = numerisch dank Zero-Padding); pro Event: `outbox.hasApplied(eventId)` → überspringen (eigenes, bereits lokal angewandtes Event), sonst `dispatch(toLocalAction(event))`; danach `advanceCursor(listId, letztePosition, alleGesehenenEventIds)`.
- Fehler **pro Liste** fangen und `console.warn` — eine unerreichbare Liste darf die anderen nicht blockieren; der nächste Reconnect holt nach.
- Bewusste Stufe-1-Grenzen (im Code-Kommentar dokumentieren): (a) Ordnungs-Divergenz bei nebenläufigen Edits wird erst durch den `withSync`-Rebase (Stufe 2) strukturell aufgelöst; (b) Crash zwischen Fold und Cursor-Persist kann den Tail einer Liste doppelt falten — verkraftbar, weil Reducer total sind und Item-Events über deterministische IDs quasi-idempotent; Stufe 2 beseitigt auch das.

- [ ] **Step 1: Failing Tests schreiben**

```ts
// src/app/sync/catchUp.test.ts
import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '../createSlice'
import { Outbox, type SyncStorage } from './outbox'
import type { WireEvent } from './transport'
import { catchUp } from './catchUp'

function memoryStorage(): SyncStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

function wireEvent(eventId: string, position: string): WireEvent {
  return {
    type: 'shopping/itemChecked',
    payload: { listId: 'l1', itemId: 'x' },
    meta: { eventId, deviceId: 'other', userId: 'u2', position },
  }
}

describe('catchUp', () => {
  it('folds foreign events as remote actions and advances the cursor', async () => {
    const outbox = await Outbox.load(memoryStorage())
    const dispatched: PayloadAction<unknown>[] = []
    await catchUp({
      outbox,
      dispatch: (action) => dispatched.push(action),
      fetchListIds: () => Promise.resolve(['l1']),
      fetchEventsSince: () =>
        Promise.resolve([
          wireEvent('f2', '00000000000000000002'),
          wireEvent('f1', '00000000000000000001'),
        ]),
    })
    expect(dispatched.map((a) => a.meta?.eventId)).toEqual(['f1', 'f2'])
    expect(dispatched.every((a) => a.meta?.remote)).toBe(true)
    expect(outbox.cursorFor('l1')).toBe('00000000000000000002')
  })

  it('skips own already-applied events but still advances past them', async () => {
    const storage = memoryStorage()
    const outbox = await Outbox.load(storage)
    await outbox.enqueue({
      kind: 'event',
      listId: 'l1',
      action: { type: 'shopping/itemChecked', payload: { listId: 'l1' }, meta: { eventId: 'mine', deviceId: 'd1' } },
    })
    await outbox.confirmHead()
    const dispatched: PayloadAction<unknown>[] = []
    await catchUp({
      outbox,
      dispatch: (action) => dispatched.push(action),
      fetchListIds: () => Promise.resolve(['l1']),
      fetchEventsSince: () =>
        Promise.resolve([
          { ...wireEvent('mine', '00000000000000000001'), meta: { eventId: 'mine', deviceId: 'd1', userId: 'u1', position: '00000000000000000001' } },
          wireEvent('theirs', '00000000000000000002'),
        ]),
    })
    expect(dispatched.map((a) => a.meta?.eventId)).toEqual(['theirs'])
    expect(outbox.cursorFor('l1')).toBe('00000000000000000002')
    expect(outbox.hasApplied('mine')).toBe(false) // pruned after passing
  })

  it('passes the stored cursor to the fetcher and isolates per-list failures', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.advanceCursor('l1', '00000000000000000005', [])
    const asked: (string | null)[] = []
    await catchUp({
      outbox,
      dispatch: () => undefined,
      fetchListIds: () => Promise.resolve(['broken', 'l1']),
      fetchEventsSince: (listId, since) => {
        if (listId === 'broken') return Promise.reject(new Error('boom'))
        asked.push(since)
        return Promise.resolve([])
      },
    })
    expect(asked).toEqual(['00000000000000000005'])
  })
})
```

- [ ] **Step 2: Test läuft rot** — `pnpm test 2>&1 | tail -20`

- [ ] **Step 3: Implementieren**

```ts
// src/app/sync/catchUp.ts
// Incremental pull: per list, fetch everything after the cursor and
// fold it in server order. Replaces the old wipe-and-refold bootstrap —
// local state stays on screen, the delta folds in on top.
//
// Stage-1 limits (fixed structurally by the withSync rebase, stage 2):
// concurrent-edit order divergence, and a crash window between fold
// and cursor persist that can re-fold one list's tail (harmless while
// reducers are total and item events are keyed by deterministic ids).

import type { PayloadAction } from '../createSlice'
import type { Outbox } from './outbox'
import type { WireEvent } from './transport'
import { toLocalAction } from './syncedActions'

export type CatchUpDeps = {
  readonly outbox: Outbox
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly fetchListIds: () => Promise<readonly string[]>
  readonly fetchEventsSince: (
    listId: string,
    since: string | null,
  ) => Promise<readonly WireEvent[]>
}

function byPosition(a: WireEvent, b: WireEvent): number {
  return a.meta.position < b.meta.position ? -1 : 1
}

export async function catchUp(deps: CatchUpDeps): Promise<void> {
  const listIds = await deps.fetchListIds()
  for (const listId of listIds) {
    try {
      const incoming = [
        ...(await deps.fetchEventsSince(listId, deps.outbox.cursorFor(listId))),
      ].sort(byPosition)
      for (const event of incoming) {
        if (!deps.outbox.hasApplied(event.meta.eventId)) {
          deps.dispatch(toLocalAction(event))
        }
      }
      const last = incoming.at(-1)
      if (last) {
        await deps.outbox.advanceCursor(
          listId,
          last.meta.position,
          incoming.map((event) => event.meta.eventId),
        )
      }
    } catch (error: unknown) {
      console.warn(`sync: catch-up for ${listId} failed`, error)
    }
  }
}
```

- [ ] **Step 4: Tests laufen grün** — `pnpm test 2>&1 | tail -5`

- [ ] **Step 5: Build + Commit**

```bash
npx prettier --write src/app/sync/catchUp.ts src/app/sync/catchUp.test.ts
pnpm build
git add -A && git commit -m "feat(sync): cursor catch-up replaces wipe-and-refold semantics"
```

---

### Task 7: Engine-Singleton + neue `syncMiddleware`, Handler-Ketten löschen

**Files:**
- Create: `src/app/sync/syncEngine.ts`
- Modify: `src/app/syncMiddleware.ts` (komplett ersetzen)
- Delete: `src/features/lists/domain/listsSyncHandler.ts`, `src/features/shopping/domain/shoppingSyncHandler.ts`
- Test: `src/app/sync/syncEngine.test.ts`

**Interfaces:**
- Consumes: alles aus Task 2–6, `clientStorage` (`getItem`/`setItem`), `store`-Typ nicht nötig (nur `dispatch`-Funktion).
- Produces:

```ts
export type SyncEngineDeps = {
  readonly storage: SyncStorage
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly send: (entry: OutboxEntry) => Promise<SendResult>
  readonly fetchListIds: () => Promise<readonly string[]>
  readonly fetchEventsSince: (listId: string, since: string | null) => Promise<readonly WireEvent[]>
}
export class SyncEngine {
  record(action: PayloadAction<unknown>): void   // called by the middleware on EVERY dispatch
  start(deps: SyncEngineDeps): Promise<void>     // load outbox, drain buffer, flush, catch up
  refresh(): void                                // reconnect trigger: catch up + flush
}
export const syncEngine: SyncEngine              // module singleton
```

**Semantik:**
- `record()`: `toOutboxEntry(action)` — `null` → nichts. Vor `start()` werden Entries in einem internen Buffer gehalten (Actions zwischen Store-Erzeugung und Engine-Start dürfen nicht verloren gehen); nach `start()` direkt `outbox.enqueue(entry)` dann `flusher.flush()`.
- `start()`: `Outbox.load(storage)` → Buffer in die Outbox überführen → `flush()` (alte Offline-Events raus) → `void catchUp(...)` (nicht awaiten — der Aufrufer soll nicht blockieren; WICHTIG für den local-first Boot in Task 8).
- `refresh()`: `void catchUp(...)` + `flush()` — der Einstiegspunkt für Reconnect-Trigger.
- Neue `syncMiddleware`: 5 Zeilen — non-PayloadActions durchreichen, sonst `syncEngine.record(action)`. Keine Handler-Liste mehr. Die beiden Handler-Dateien löschen.

- [ ] **Step 1: Prüfen, dass keine bestehenden Tests die Handler importieren**

Run: `grep -rn "SyncHandler" src --include="*.test.ts" --include="*.test.tsx"`
Expected: kein Treffer. (Falls doch: STOPP — Test-Policy, User fragen.)

- [ ] **Step 2: Failing Tests schreiben**

```ts
// src/app/sync/syncEngine.test.ts
import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '../createSlice'
import type { OutboxEntry, SyncStorage } from './outbox'
import type { SendResult } from './transport'
import { SyncEngine } from './syncEngine'

function memoryStorage(): SyncStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

function syncedAction(eventId: string): PayloadAction<unknown> {
  return {
    type: 'shopping/itemChecked',
    payload: { listId: 'l1', itemId: 'x', checkedBy: 'u1' },
    meta: { eventId, deviceId: 'd1' },
  }
}

describe('SyncEngine', () => {
  it('buffers actions recorded before start and sends them after start', async () => {
    const engine = new SyncEngine()
    const sent: OutboxEntry[] = []
    engine.record(syncedAction('early'))
    await engine.start({
      storage: memoryStorage(),
      dispatch: () => undefined,
      send: (entry) => {
        sent.push(entry)
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      fetchListIds: () => Promise.resolve([]),
      fetchEventsSince: () => Promise.resolve([]),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(1)
  })

  it('ignores remote and unsynced actions', async () => {
    const engine = new SyncEngine()
    const sent: OutboxEntry[] = []
    engine.record({ type: 'app/appLoaded', payload: {}, meta: { eventId: 'x', deviceId: 'd1' } })
    engine.record({ ...syncedAction('r1'), meta: { eventId: 'r1', deviceId: 'd1', remote: true } })
    await engine.start({
      storage: memoryStorage(),
      dispatch: () => undefined,
      send: (entry) => {
        sent.push(entry)
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      fetchListIds: () => Promise.resolve([]),
      fetchEventsSince: () => Promise.resolve([]),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Test läuft rot** — `pnpm test 2>&1 | tail -20`

- [ ] **Step 4: Implementieren**

```ts
// src/app/sync/syncEngine.ts
// Wires outbox, flush and catch-up together. A module singleton because
// exactly one engine exists per app — the middleware records into it,
// the bootstrap starts it, reconnect triggers call refresh().

import type { PayloadAction } from '../createSlice'
import { Outbox, type OutboxEntry, type SyncStorage } from './outbox'
import { createFlusher, type Flusher } from './flush'
import { catchUp } from './catchUp'
import { toOutboxEntry } from './syncedActions'
import type { SendResult, WireEvent } from './transport'

export type SyncEngineDeps = {
  readonly storage: SyncStorage
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly send: (entry: OutboxEntry) => Promise<SendResult>
  readonly fetchListIds: () => Promise<readonly string[]>
  readonly fetchEventsSince: (
    listId: string,
    since: string | null,
  ) => Promise<readonly WireEvent[]>
}

export class SyncEngine {
  // Actions can be dispatched before start() finished loading the
  // outbox — they wait here so nothing is lost.
  private preStartBuffer: OutboxEntry[] = []
  private outbox: Outbox | null = null
  private flusher: Flusher | null = null
  private deps: SyncEngineDeps | null = null

  record(action: PayloadAction<unknown>): void {
    const entry = toOutboxEntry(action)
    if (!entry) return
    if (this.outbox && this.flusher) {
      void this.outbox.enqueue(entry).then(() => this.flusher?.flush())
    } else {
      this.preStartBuffer.push(entry)
    }
  }

  async start(deps: SyncEngineDeps): Promise<void> {
    this.deps = deps
    const outbox = await Outbox.load(deps.storage)
    for (const entry of this.preStartBuffer) {
      await outbox.enqueue(entry)
    }
    this.preStartBuffer = []
    this.outbox = outbox
    this.flusher = createFlusher(outbox, deps.send)
    this.flusher.flush()
    this.refresh()
  }

  refresh(): void {
    if (!this.outbox || !this.deps) return
    void catchUp({
      outbox: this.outbox,
      dispatch: this.deps.dispatch,
      fetchListIds: this.deps.fetchListIds,
      fetchEventsSince: this.deps.fetchEventsSince,
    }).finally(() => this.flusher?.flush())
  }
}

export const syncEngine = new SyncEngine()
```

Neue `src/app/syncMiddleware.ts` (Datei ersetzen):

```ts
// Effects only (sync-engine.md §3): every dispatched action is offered
// to the sync engine, which decides via toOutboxEntry whether it enters
// the outbox. No per-feature handlers — a new synced event costs zero
// sync code.

import type { Middleware } from '@reduxjs/toolkit'
import { isPayloadAction } from './createSlice'
import { syncEngine } from './sync/syncEngine'

export const syncMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action)
  if (isPayloadAction(action)) syncEngine.record(action)
  return result
}
```

Dann löschen:

```bash
git rm src/features/lists/domain/listsSyncHandler.ts src/features/shopping/domain/shoppingSyncHandler.ts
```

- [ ] **Step 5: Tests + Build laufen grün** — `pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -3`

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/app/sync/syncEngine.ts src/app/sync/syncEngine.test.ts src/app/syncMiddleware.ts
git add -A && git commit -m "feat(sync): engine singleton replaces per-feature sync handlers"
```

---

### Task 8: Local-First-Boot + Engine-Start + Reconnect-Trigger

**Files:**
- Modify: `src/app/router.ts`
- Modify: `src/app/appSlice.ts`
- Create: `src/app/sync/startSync.ts`
- Delete: `src/app/serverBootstrap.ts`
- Test: keine neuen Unit-Tests (Verkabelung); Verifikation manuell in Task 10. `pnpm test` muss grün bleiben.

**Interfaces:**
- Consumes: `syncEngine` (Task 7), `sendEntry`/`fetchListIds`/`fetchEventsSince` (Task 3), `clientStorage`, `store`.
- Produces: `startSync(): void` — startet Engine + registriert Reconnect-Trigger; `appSlice` bekommt `initialSyncDone: boolean` + Action `initialSyncCompleted` + Selektor `selectInitialSyncDone`.

**Schritte:**

- [ ] **Step 1: Capacitor-Plugins installieren** (Reconnect-Trigger sind Pflicht-Bausteine, sync-engine.md „Mobile-Constraints"; beide Plugins haben Web-Implementierungen, funktionieren also auch im Browser-Dev)

```bash
pnpm add @capacitor/network @capacitor/app
```

- [ ] **Step 2: `appSlice` erweitern**

`AppState` bekommt `readonly initialSyncDone: boolean` (initial `false`). `appLoaded` muss das Feld erhalten: Reducer auf `(state, action) => ({ ...state, theme: …, deviceId: … })` umstellen. Neue Action:

```ts
    initialSyncCompleted: (state: AppState): AppState => ({
      ...state,
      initialSyncDone: true,
    }),
```

Neuer Selektor:

```ts
export const selectInitialSyncDone = (state: { readonly app: AppState }) =>
  state.app.initialSyncDone
```

- [ ] **Step 3: `startSync.ts` schreiben**

```ts
// src/app/sync/startSync.ts
// Composition root of the engine: real storage, real transport, real
// store — plus the reconnect triggers. The subscription-less stage-1
// receive path is the cursor catch-up on start, resume and reconnect
// (sync-engine.md, mobile constraints).

import { App as CapacitorApp } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { store } from '../store'
import { getItem, setItem } from '../clientStorage'
import { initialSyncCompleted } from '../appSlice'
import { syncEngine } from './syncEngine'
import { fetchEventsSince, fetchListIds, sendEntry } from './transport'

export function startSync(): void {
  void syncEngine
    .start({
      storage: { getItem, setItem },
      dispatch: (action) => store.dispatch(action),
      send: sendEntry,
      fetchListIds,
      fetchEventsSince,
    })
    .finally(() => store.dispatch(initialSyncCompleted()))

  void Network.addListener('networkStatusChange', (status) => {
    if (status.connected) syncEngine.refresh()
  })
  void CapacitorApp.addListener('appStateChange', (state) => {
    if (state.isActive) syncEngine.refresh()
  })
}
```

Hinweis: `initialSyncCompleted` wird nach `start()` dispatcht — `start()` awaited den Catch-up bewusst nicht (siehe Task 7). Damit der „erster Sync fertig"-Moment stimmt, `SyncEngine.start()` so anpassen, dass es ein Promise des initialen `catchUp` zurückreicht: `refresh()` bekommt eine private Variante `runCatchUp(): Promise<void>` und `start()` endet mit `return this.runCatchUp()` statt `this.refresh()` — Aufrufer, die nicht warten wollen (Reconnect), nutzen weiter `refresh()`. Test aus Task 7 bleibt gültig (awaited `start()` sowieso).

- [ ] **Step 4: `router.ts` umbauen**

Im Root-`beforeLoad`:
1. `hydrateFromServer`-Import und -Aufruf entfernen; `const serverHydrated = …`-Block ersatzlos streichen; alle `serverHydrated ? … : …`-Verzweigungen auf den Lokal-Pfad reduzieren (Schritt 3 und 5 des heutigen Codes laufen also immer).
2. `DEFAULT_LISTS` und `DEFAULT_LIST_PREFERENCES` **komplett entfernen** (samt Fallback-Logik `lists.length > 0 ? lists : DEFAULT_LISTS` → nur noch `lists`, und `allPreferences`-Fallback → nur noch `preferences`). Begründung: Mit echtem Server-Catch-up würden die Demo-Listen mit den Server-Events verschmelzen — `status.md` §2 führt sie als Provisorium („Demo-Daten, kein Feature").
3. Am Ende des Bootstraps (nach `appLoaded`), NUR wenn authentifiziert:

```ts
    if (selectIsAuthenticated(store.getState())) startSync()
```

(Import: `import { startSync } from './sync/startSync'`.) Kein `await` — genau das ist der local-first Boot: Render sofort, Sync im Hintergrund.
4. `src/app/serverBootstrap.ts` löschen: `git rm src/app/serverBootstrap.ts`. Vorher prüfen, dass niemand mehr importiert: `grep -rn "serverBootstrap" src` → nur router.ts (das wir gerade ändern).

- [ ] **Step 5: Tests + Build** — `pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -3`
Expected: grün. (Bestehende Tests berühren router/serverBootstrap nicht.)

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/app/router.ts src/app/appSlice.ts src/app/sync/startSync.ts src/app/sync/syncEngine.ts
git add -A && git commit -m "feat(sync): local-first boot with background catch-up and reconnect triggers"
```

---

### Task 9: Erste-Nutzung-UX — Skeleton solange initialer Sync läuft

**Files:**
- Modify: `src/features/lists/overview/ListsPageSkeleton.tsx` (nur `export` vor `function ListCardSkeleton` + `function Shimmer`)
- Modify: `src/features/lists/overview/ListsPage.tsx`
- Test: keine neuen (reine View-Verkabelung; Selektor-Logik ist trivial)

**Semantik:** Nach dem Local-First-Umbau rendert die Listen-Übersicht bei einem frischen Gerät sofort — aber leer, während der erste Catch-up läuft. Beschlossene UX (User-Entscheidung, Skeleton-Variante B): In diesem Fall Skeleton-Karten statt leerem Grid. Sobald `initialSyncDone` ODER Listen vorhanden sind → normale Darstellung. Kein neuer State — beides sind vorhandene Store-Werte (berechnet, nicht gespeichert).

- [ ] **Step 1: `ListCardSkeleton` und `Shimmer` exportieren** (nur `export`-Keyword ergänzen, sonst nichts ändern)

- [ ] **Step 2: `ListsPage` erweitern**

Imports ergänzen: `selectInitialSyncDone` aus `../../../app/appSlice`, `ListCardSkeleton` aus `./ListsPageSkeleton`. Im Component-Body:

```ts
  const initialSyncDone = useAppSelector(selectInitialSyncDone)
  const showSyncSkeleton = lists.length === 0 && !initialSyncDone
```

Im Grid (`<div className="grid grid-cols-2 gap-3 px-5">`), VOR `{lists.map(…)}`:

```tsx
        {showSyncSkeleton &&
          [0, 1, 2, 3].map((index) => (
            <ListCardSkeleton key={index} delayMs={index * 150} />
          ))}
```

Und die `CreateListCard` nur zeigen, wenn nicht gerade das Sync-Skeleton läuft: `{!showSyncSkeleton && <CreateListCard onClick={goToCreateList} />}`.

- [ ] **Step 3: Tests + Build** — `pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -3`

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/features/lists/overview/ListsPage.tsx src/features/lists/overview/ListsPageSkeleton.tsx
git add -A && git commit -m "feat(lists): skeleton cards while the initial sync is running"
```

---

### Task 10: Doku nachziehen + End-to-End-Verifikation

**Files:**
- Modify: `architecture/status.md` (Repo-Root, nicht apps/mobile)

- [ ] **Step 1: Manuelle Verifikation im Browser**

```bash
pnpm dev --port 5199 --strictPort   # in apps/mobile, im Hintergrund
```

Checkliste (Browser auf `http://localhost:5199`):
1. Ausgeloggt: App lädt auf `/signin`, keine Konsolen-Fehler, kein Sync-Start (Engine startet nur authentifiziert).
2. Kaltstart-Verhalten: kein weißer Screen (Router-Skeleton aus dem früheren Umbau greift weiterhin während des lokalen Boots).
3. Falls Test-Login vorhanden: Nach Login Reload → Listen erscheinen sofort aus dem lokalen Storage; im Netzwerk-Tab: `GET /lists` + `GET /lists/{id}/events?since=…` im Hintergrund; Item abhaken → `POST /lists/{id}/events` mit Retry-Verhalten prüfbar via DevTools-Offline-Modus (offline abhaken → wieder online → POST geht raus). **Ohne Test-Login:** diesen Punkt als „nicht verifiziert" in status.md notieren — nicht raten.
4. Dev-Server wieder stoppen.

- [ ] **Step 2: `status.md` aktualisieren**

- §1-Tabelle: „Sync zum Server" → `🟡 Stufe 1 (Outbox, Cursor, Retry) gebaut; Rebase (withSync) fehlt`; „Offline-Queue" → `✅ Outbox mit Retry`.
- §2 „Bekannte Provisorien": Einträge zu `listsSyncHandler` (auskommentierte Fetches) und `DEFAULT_LISTS` entfernen bzw. als erledigt streichen; neuen Absatz „Sync Engine Stufe 1" mit den Stufe-1-Grenzen aus Task 6 (Ordnungs-Divergenz bis withSync, Crash-Fenster Cursor-Persist) ergänzen.
- §9: Schritt 5 abhaken (~~…~~ ✅ mit Datum), Schritt 6 (Property-Tests) als nächsten markieren.
- Was tatsächlich verifiziert wurde (Punkt 3 aus Step 1) ehrlich eintragen.

- [ ] **Step 3: Finale Prüfung + Commit**

```bash
pnpm build && pnpm test
git add -A && git commit -m "docs: record sync engine stage 1 in status.md"
```

---

## Self-Review-Ergebnis

- **Spec-Abdeckung:** §4-Bausteine Outbox (T2), Transport (T3), Cursor (T2+T6), Empfang/Dedup (T6), Retry/Ablehnung (T5), `synced`-Policy (T1+T4), Reconnect-Trigger (T8), „Middleware nur Effects" (T7). Bewusst NICHT drin: `withSync`/Rebase (§9 Schritt 7), Property-Tests (Schritt 6), AppSync-Subscribe (kein Backend-Publisher vorhanden — `EventPublisher` ist Noop), Batching im Transport (Backend nimmt ein Event pro POST; sequenzielles Senden wahrt die Ordnung), Filesystem-Backend im `clientStorage`-Wrapper (Wrapper-intern, separat).
- **Offene bewusste Abweichungen, dem User bekannt zu machen:** DEFAULT_LISTS-Demo-Daten werden entfernt (T8); `serverBootstrap.ts`, `listsSyncHandler.ts`, `shoppingSyncHandler.ts` werden gelöscht.
- **Typ-Konsistenz geprüft:** `OutboxEntry`/`SyncStorage`/`SendResult`/`WireEvent`/`Fetcher` werden überall mit identischen Namen/Formen verwendet; `entryEventId` T2↔T5; `toOutboxEntry`/`toLocalAction` T4↔T6/T7.
