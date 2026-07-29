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
