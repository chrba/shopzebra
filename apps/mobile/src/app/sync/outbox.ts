// The bridge between send and receive path — one persisted blob
// (`shopzebra_sync`): FIFO send queue (write side) + cursor per aggregate
// (read side). Deliberately ONE object so the two sides can never drift
// apart across restarts.

import type { PayloadAction } from '../createSlice'
import { cursorKeyOf, type Aggregate } from './aggregate'
import { withRewrittenAuthor } from './authorRewrite'

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

/** The receive path's view of the bridge (receive/catchUp.ts). */
export interface ReceiveLedger {
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
}

export const SYNC_STORAGE_KEY = 'shopzebra_sync'

const EMPTY: OutboxState = {
  queue: [],
  cursorByAggregate: {},
}

function isOutboxEntry(candidate: unknown): candidate is OutboxEntry {
  if (candidate === null || typeof candidate !== 'object') return false
  const entry = candidate as { readonly path?: unknown; readonly wire?: unknown }
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
    }
  } catch {
    return EMPTY
  }
}

export class Outbox implements SendQueue, ReceiveLedger {
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

  /**
   * Called once, when the device docks onto its real identity: every event
   * queued under the local sentinel now belongs to the new user. Without
   * it the server would reject the whole backlog (CreatorMustBeCaller).
   */
  rewriteAuthor(previousUserId: string, userId: string): Promise<void> {
    return this.commit({
      ...this.state,
      queue: this.state.queue.map((entry) =>
        withRewrittenAuthor(entry, previousUserId, userId),
      ),
    })
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
