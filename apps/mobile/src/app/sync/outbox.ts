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
