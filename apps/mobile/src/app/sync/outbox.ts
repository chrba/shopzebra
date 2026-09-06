// The bridge between send and receive path — one persisted blob
// (`shopzebra_sync`): FIFO send queue (write side), cursor per aggregate and
// what this device let go of (read side). Deliberately ONE object so the two
// sides can never drift apart across restarts.

import type { PayloadAction } from '../createSlice'
import { cursorKeyOf, parseAggregate, type Aggregate } from './aggregate'

/**
 * One queued send: target path + wire payload. Routing happens at enqueue
 * time (syncPolicy.ts), so queue and transport stay aggregate-agnostic.
 */
export type OutboxEntry = {
  readonly path: string
  readonly wire: PayloadAction<unknown>
}

/** The send path's view of the bridge (send/drainOutbox.ts). */
export interface SendQueue {
  /** Next entry to send, or null when the queue is empty. Polled by the drain loop before every send. */
  head(): OutboxEntry | null
  /** Removes the head once its send is settled — accepted (2xx) or rejected (4xx). Resolves when the change is persisted. */
  removeHead(): Promise<void>
}

/**
 * What this device deliberately let go of. Its own role interface, because
 * it answers a different question than the cursor: not "how far did I fold"
 * but "do I still want this at all". Nothing in the log answers it — leaving
 * a list is not an event of that list — so it is kept here, beside the
 * cursor, where the pull can see it and a restart still finds it.
 */
export interface Releases {
  /** True while this device has let go and the server still names the aggregate. Asked once per aggregate per pull. */
  hasReleased(aggregate: Aggregate): boolean
  /** Every release not settled yet. Walked at both ends of a sync cycle. */
  releasedAggregates(): readonly Aggregate[]
  /** Records the letting-go. Called by SyncEngine.offer for actions declaring `releases`. Resolves when persisted. */
  release(aggregate: Aggregate): Promise<void>
  /** Settles one: the server stopped naming it, or this device holds it again. Resolves when persisted. */
  reclaim(aggregate: Aggregate): Promise<void>
}

/** The receive path's view of the bridge (receive/catchUp.ts): one cursor per aggregate. */
export interface Cursors {
  /** Last confirmed position of an aggregate, or null before the first catch-up. Goes into `?since=` when fetching the delta. */
  cursorFor(aggregate: Aggregate): string | null
  /** Moves the cursor after a confirmed batch was dispatched — never before, or events would be skipped forever. Resolves when persisted. */
  advanceCursor(aggregate: Aggregate, position: string): Promise<void>
}

export type SyncStorage = {
  readonly getItem: (key: string) => Promise<string | null>
  readonly setItem: (key: string, value: string) => Promise<void>
}

/** Identity of an entry — used for server dedup and pending matching. */
export function eventIdOf(entry: OutboxEntry): string {
  return entry.wire.meta?.eventId ?? ''
}

type OutboxState = {
  readonly queue: readonly OutboxEntry[]
  /** Keyed by cursorKeyOf(aggregate) — kind and id, never id alone. */
  readonly cursorByAggregate: { readonly [cursorKey: string]: string }
  /** Aggregates this device let go of, until the server agrees. */
  readonly released: readonly Aggregate[]
}

export const SYNC_STORAGE_KEY = 'shopzebra_sync'

const EMPTY: OutboxState = {
  queue: [],
  cursorByAggregate: {},
  released: [],
}

function isOutboxEntry(candidate: unknown): candidate is OutboxEntry {
  if (candidate === null || typeof candidate !== 'object') return false
  const entry = candidate as {
    readonly path?: unknown
    readonly wire?: unknown
  }
  return typeof entry.path === 'string' && typeof entry.wire === 'object'
}

/**
 * Turns the raw storage string into a valid OutboxState. clientStorage
 * stores strings only, so the whole state lives as one JSON string:
 * commit() stringifies it, this parses it back. Called once per engine
 * start, by Outbox.load() — null on a fresh device or after sign-out.
 * Never throws, a broken blob must not block the engine: bad JSON →
 * EMPTY, malformed queue entries → dropped, missing fields → defaults.
 * Worst case is a lost cursor (one full refetch), never a crash.
 */
function parseOutboxState(raw: string | null): OutboxState {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return EMPTY
    const candidate = parsed as Partial<OutboxState>
    return {
      queue: Array.isArray(candidate.queue)
        ? candidate.queue.filter(isOutboxEntry)
        : [],
      cursorByAggregate:
        candidate.cursorByAggregate !== null &&
        typeof candidate.cursorByAggregate === 'object'
          ? candidate.cursorByAggregate
          : {},
      released: Array.isArray(candidate.released)
        ? candidate.released
            .map(parseAggregate)
            .filter((aggregate): aggregate is Aggregate => aggregate !== null)
        : [],
    }
  } catch {
    return EMPTY
  }
}

/**
 * True when the server has ever answered this device. A cursor is only ever
 * advanced by a catch-up, and a catch-up only happens with a token behind
 * it — so a cursor proves an account exists, whatever the shadow
 * credentials happen to claim about themselves.
 *
 * Called at boot, before the outbox is loaded, which is why it reads the
 * blob rather than going through an instance.
 */
export async function serverHasAnsweredBefore(
  storage: SyncStorage,
): Promise<boolean> {
  const state = parseOutboxState(await storage.getItem(SYNC_STORAGE_KEY))
  return Object.keys(state.cursorByAggregate).length > 0
}

export class Outbox implements SendQueue, Cursors, Releases {
  // Mutable infrastructure state behind an immutable-value API.
  private state: OutboxState
  private lastWrite: Promise<void> = Promise.resolve()

  private constructor(
    private readonly storage: SyncStorage,
    initial: OutboxState,
  ) {
    this.state = initial
  }

  /** Called once by SyncEngine.start(). */
  static async load(storage: SyncStorage): Promise<Outbox> {
    const raw = await storage.getItem(SYNC_STORAGE_KEY)
    return new Outbox(storage, parseOutboxState(raw))
  }

  /** Next entry to send. Called by the drain loop. */
  head(): OutboxEntry | null {
    return this.state.queue[0] ?? null
  }

  /** Queue length. Read by the engine's push barrier (pushQueuedEvents) to tell whether a cycle moved anything. */
  size(): number {
    return this.state.queue.length
  }

  /** Called once at engine start to rebuild the reducer's pending queue. */
  queuedEntries(): readonly OutboxEntry[] {
    return this.state.queue
  }

  /** Called for every synced dispatch. Appends and persists. */
  enqueue(entry: OutboxEntry): Promise<void> {
    return this.commit({
      ...this.state,
      queue: [...this.state.queue, entry],
    })
  }

  /**
   * Called when the server accepted (2xx) or rejected (4xx) the head —
   * either way its send is over. An accepted event folds in via the sync
   * cycle's pull; a rejected one is also discarded from the reducer's
   * pending (the engine dispatches pendingDiscarded per DrainResult).
   */
  removeHead(): Promise<void> {
    if (!this.head()) return Promise.resolve()
    return this.commit({ ...this.state, queue: this.state.queue.slice(1) })
  }

  /** Last folded position of an aggregate. Called by catch-up (`?since=`). */
  cursorFor(aggregate: Aggregate): string | null {
    return this.state.cursorByAggregate[cursorKeyOf(aggregate)] ?? null
  }

  /**
   * Called after catch-up dispatched a confirmed batch. Deliberately NOT
   * called on ack: foreign events may sit between the cursor and the
   * acked position — they still have to be fetched.
   */
  advanceCursor(aggregate: Aggregate, position: string): Promise<void> {
    return this.commit({
      ...this.state,
      cursorByAggregate: {
        ...this.state.cursorByAggregate,
        [cursorKeyOf(aggregate)]: position,
      },
    })
  }

  /** True while this device has let go of the aggregate. Called by the pull, per aggregate the server named. */
  hasReleased(aggregate: Aggregate): boolean {
    const key = cursorKeyOf(aggregate)
    return this.state.released.some(
      (released) => cursorKeyOf(released) === key,
    )
  }

  /** Every unsettled release. Called at both ends of a sync cycle. */
  releasedAggregates(): readonly Aggregate[] {
    return this.state.released
  }

  /** Called when a `releases` action was dispatched. Idempotent. */
  release(aggregate: Aggregate): Promise<void> {
    if (this.hasReleased(aggregate)) return Promise.resolve()
    return this.commit({
      ...this.state,
      released: [...this.state.released, aggregate],
    })
  }

  /**
   * Called once the release has served its purpose: the server stopped
   * naming the aggregate, or this device holds it again because leaving
   * failed. Forgetting it is what lets a later invitation bring the
   * aggregate back.
   */
  reclaim(aggregate: Aggregate): Promise<void> {
    if (!this.hasReleased(aggregate)) return Promise.resolve()
    const key = cursorKeyOf(aggregate)
    return this.commit({
      ...this.state,
      released: this.state.released.filter(
        (released) => cursorKeyOf(released) !== key,
      ),
    })
  }

  /** Serializes persists through a promise chain — no write overtakes another. */
  private commit(next: OutboxState): Promise<void> {
    this.state = next
    this.lastWrite = this.lastWrite
      .then(() =>
        this.storage.setItem(SYNC_STORAGE_KEY, JSON.stringify(this.state)),
      )
      .catch((error: unknown) => {
        console.warn('sync: outbox persist failed', error)
      })
    return this.lastWrite
  }
}
