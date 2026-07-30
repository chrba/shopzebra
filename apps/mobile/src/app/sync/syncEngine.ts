// Wires outbox, flush and catch-up together. Module singleton —
// exactly one engine exists per app.

import type { PayloadAction } from '../createSlice'
import { getItem, setItem } from '../clientStorage'
import { Outbox, type OutboxEntry, type SyncStorage } from './outbox'
import { createFlusher, type Flusher } from './send/flush'
import { toOutboxEntry } from './send/toOutboxEntry'
import { catchUp } from './receive/catchUp'
import { httpTransport, type Transport } from './transport'
import { pendingDiscarded, pendingRestored } from './withSync'
import { domainActionOf } from './wire'

export type Dispatch = (action: PayloadAction<unknown>) => void

export class SyncEngine {
  // Holds entries dispatched before start() finished loading the outbox.
  private preStartBuffer: OutboxEntry[] = []
  private outbox: Outbox | null = null
  private flusher: Flusher | null = null
  private dispatch: Dispatch | null = null

  constructor(
    private readonly storage: SyncStorage,
    private readonly transport: Transport,
  ) {}

  /** Called by syncMiddleware for every dispatch. Buffers until start() ran. */
  record(action: PayloadAction<unknown>): void {
    const entry = toOutboxEntry(action)
    if (!entry) return
    if (this.outbox && this.flusher) {
      void this.outbox.enqueue(entry).then(() => this.flusher?.flush())
    } else {
      this.preStartBuffer.push(entry)
    }
  }

  /**
   * Called once per signed-in session (startSync). Loads the persisted
   * queue, starts sending, resolves when the first catch-up is done.
   * `dispatch` arrives here, not in the constructor — the store is built
   * after this singleton (the middleware needs the instance first).
   */
  async start(dispatch: Dispatch): Promise<void> {
    this.dispatch = dispatch
    const outbox = await Outbox.load(this.storage)
    for (const entry of this.preStartBuffer) {
      await outbox.enqueue(entry)
    }
    this.preStartBuffer = []
    this.outbox = outbox
    // Refill the reducer's pending queue from the persisted outbox —
    // without it, offline edits would be invisible after a restart.
    dispatch(
      pendingRestored(
        outbox.queuedEntries().map((entry) => domainActionOf(entry.wire)),
      ),
    )
    this.flusher = createFlusher(outbox, this.transport.sendEntry, (eventId) =>
      dispatch(pendingDiscarded(eventId)),
    )
    this.flusher.flush()
    return this.runCatchUp()
  }

  /** Called on app resume and network reconnect. Fire-and-forget catch-up. */
  refresh(): void {
    void this.runCatchUp()
  }

  /**
   * Called on sign-out (stopSync). record() buffers again, refresh()
   * no-ops — nothing is sent under a dying session. A later start()
   * rebuilds everything from scratch.
   */
  stop(): void {
    this.outbox = null
    this.flusher = null
    this.dispatch = null
    this.preStartBuffer = []
  }

  // Catches its own rejections — an offline catch-up is a warning, not a crash.
  private runCatchUp(): Promise<void> {
    if (!this.outbox || !this.dispatch) return Promise.resolve()
    return catchUp({
      ledger: this.outbox,
      dispatch: this.dispatch,
      fetchListIds: this.transport.fetchListIds,
      fetchEventsSince: this.transport.fetchEventsSince,
    })
      .catch((error: unknown) => {
        console.warn('sync: catch-up failed', error)
      })
      .finally(() => this.flusher?.flush())
  }
}

/** The app's engine: device storage + HTTP transport. syncMiddleware
 *  records into it, startSync drives its lifecycle. */
export const syncEngine = new SyncEngine({ getItem, setItem }, httpTransport)
