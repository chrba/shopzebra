// The sync cycle: every trigger (record, boot, sign-in, reconnect, resume,
// retry timer) funnels into requestSync(), which runs one push-then-pull
// cycle at a time. The whole choreography lives in syncOnce(); outbox,
// drain and catch-up are plain steps that report results. Module singleton —
// exactly one engine exists per app.

import type { PayloadAction } from '../createSlice'
import { getItem, setItem } from '../clientStorage'
import { Outbox, type OutboxEntry, type SyncStorage } from './outbox'
import { withRewrittenAuthor } from './authorRewrite'
import { drainOutbox } from './send/drainOutbox'
import { toOutboxEntry } from './send/toOutboxEntry'
import { catchUp } from './receive/catchUp'
import { httpTransport, type Transport } from './transport'
import { pendingDiscarded, pendingRestored } from './withSync'
import { domainActionOf } from './wire'

export type Dispatch = (action: PayloadAction<unknown>) => void

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

export class SyncEngine {
  // Holds entries dispatched before start() finished loading the outbox.
  private preStartBuffer: OutboxEntry[] = []
  private outbox: Outbox | null = null
  private dispatch: Dispatch | null = null

  // The binary sync rule (accountless-first-planned.md): until the device
  // has an identity there is no account to send under. A cycle would POST
  // without a session, collect a 401 and drop the event as a 4xx — for
  // good. The log stays local instead, and waits.
  private mayContactServer = false

  // One cycle at a time; triggers arriving mid-cycle coalesce into exactly
  // one follow-up cycle.
  private cycleInFlight: Promise<void> | null = null
  private cycleQueued = false

  // Backoff for a blocked queue (offline/5xx): 1s → 30s, reset on success.
  private failedAttempts = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly storage: SyncStorage,
    private readonly transport: Transport,
  ) {}

  /** Called by syncMiddleware for every dispatch. Buffers until start() ran. */
  record(action: PayloadAction<unknown>): void {
    const entry = toOutboxEntry(action)
    if (!entry) return
    if (this.outbox) {
      void this.outbox.enqueue(entry).then(() => this.requestSync())
    } else {
      this.preStartBuffer.push(entry)
    }
  }

  /**
   * Opens the local event log. Called at every app start, with or without
   * an identity: before the first account exists the outbox IS the local
   * log (accountless-first-planned.md), so it has to load and persist even
   * though nothing may be sent yet. Contacts no server.
   *
   * `dispatch` arrives here, not in the constructor — the store is built
   * after this singleton (the middleware needs the instance first).
   */
  async openLocalLog(dispatch: Dispatch): Promise<void> {
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
  }

  /**
   * Called once per identity (startSync). Opens the log if it is not open
   * yet, allows server contact from now on, and resolves when the first
   * sync cycle is done.
   */
  async start(dispatch: Dispatch): Promise<void> {
    if (!this.outbox) await this.openLocalLog(dispatch)
    this.mayContactServer = true
    return this.requestSync()
  }

  /**
   * Moves the whole queued log to a new author. Called by ensureIdentity
   * the moment the shadow account exists — before server contact is
   * allowed, so no cycle can ever ship an event under the old author.
   */
  async rewriteQueuedAuthor(
    previousUserId: string,
    userId: string,
  ): Promise<void> {
    this.preStartBuffer = this.preStartBuffer.map((entry) =>
      withRewrittenAuthor(entry, previousUserId, userId),
    )
    await this.outbox?.rewriteAuthor(previousUserId, userId)
  }

  /** Called on app resume and network reconnect. Fire-and-forget cycle. */
  refresh(): void {
    void this.requestSync()
  }

  /**
   * Called on sign-out (stopSync). Cancels the retry timer, record()
   * buffers again, refresh() no-ops — nothing is sent under a dying
   * session. A later start() rebuilds everything from scratch.
   */
  stop(): void {
    this.mayContactServer = false
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.cycleQueued = false
    this.failedAttempts = 0
    this.outbox = null
    this.dispatch = null
    this.preStartBuffer = []
  }

  /**
   * The single entry point for every sync trigger. Catches its own
   * rejections — an offline cycle is a warning, not a crash.
   */
  requestSync(): Promise<void> {
    const outbox = this.outbox
    const dispatch = this.dispatch
    if (!outbox || !dispatch || !this.mayContactServer) return Promise.resolve()
    if (this.cycleInFlight) {
      this.cycleQueued = true
      return this.cycleInFlight
    }
    const run = this.syncOnce(outbox, dispatch)
      .catch((error: unknown) => {
        console.warn('sync: cycle failed', error)
      })
      .finally(() => {
        this.cycleInFlight = null
        if (this.cycleQueued) {
          this.cycleQueued = false
          void this.requestSync()
        }
      })
    this.cycleInFlight = run
    return run
  }

  // The sync choreography, in one place: push own events, roll rejected
  // ones back, then pull — the pull comes after the push so it returns the
  // acks of the just-delivered events along with everything foreign.
  private async syncOnce(outbox: Outbox, dispatch: Dispatch): Promise<void> {
    const sent = await drainOutbox(outbox, this.transport.sendEntry)
    for (const eventId of sent.rejected) {
      dispatch(pendingDiscarded(eventId))
    }
    if (sent.blocked) {
      this.scheduleRetry()
    } else {
      this.failedAttempts = 0
    }
    await catchUp({
      ledger: outbox,
      dispatch,
      fetchAggregates: this.transport.fetchAggregates,
      fetchEventsSince: this.transport.fetchEventsSince,
    })
  }

  // The retry timer is just another requestSync trigger.
  private scheduleRetry(): void {
    if (this.retryTimer) return
    const delay = Math.min(RETRY_BASE_MS * 2 ** this.failedAttempts, RETRY_MAX_MS)
    this.failedAttempts += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.requestSync()
    }, delay)
  }
}

/** The app's engine: device storage + HTTP transport. syncMiddleware
 *  records into it, startSync drives its lifecycle. */
export const syncEngine = new SyncEngine({ getItem, setItem }, httpTransport)
