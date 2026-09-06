// The sync cycle: every trigger (offer, boot, sign-in, reconnect, resume,
// retry timer) funnels into requestSync(), which runs one push-then-pull
// cycle at a time. The whole choreography lives in syncOnce(); outbox,
// drain and catch-up are plain steps that report results. Module singleton —
// exactly one engine exists per app.

import type { PayloadAction } from '../createSlice'
import { getItem, setItem } from '../clientStorage'
import { Outbox, type OutboxEntry, type SyncStorage } from './outbox'
import { cursorsGuardedByFoldedState } from './receive/guardedCursors'
import { silenceForReleasedAggregates } from './receive/silenceForReleased'
import { ALL_KINDS, cursorKeyOf, type Aggregate } from './aggregate'
import { drainOutbox } from './send/drainOutbox'
import { catchUp } from './receive/catchUp'
import {
  httpTransport,
  type CollectionListing,
  type Transport,
} from './transport'
import { pendingDiscarded, pendingRestored } from './withSync'
import { appSyncPolicy } from './appSyncPolicy'
import type { SyncPolicy } from './syncPolicy'

export type Dispatch = (action: PayloadAction<unknown>) => void

/**
 * Reads a round of collection listings as the one question the letting-go
 * asks: does the server say this aggregate is not ours any more? Only a
 * collection that answered can say so — silence from an unreadable one is
 * not a "no".
 */
function answersOf(collections: readonly CollectionListing[]) {
  const answered = new Set(collections.map((collection) => collection.kind))
  const named = new Set(
    collections.flatMap((collection) => collection.named.map(cursorKeyOf)),
  )
  return {
    saysGone: (aggregate: Aggregate): boolean =>
      answered.has(aggregate.kind) && !named.has(cursorKeyOf(aggregate)),
  }
}

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

export class SyncEngine {
  // Holds entries offered before openLocalLog() finished loading the outbox.
  private preStartBuffer: OutboxEntry[] = []
  // Same for aggregates let go of before the log was open.
  private preStartReleases: Aggregate[] = []
  private outbox: Outbox | null = null
  private dispatch: Dispatch | null = null

  // The binary sync rule: until the device
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

  // What this device currently holds, and how to let go of one — both
  // installed by start(), because the engine must not know about Redux.
  // The empty default is the careful one: no cursor is resumed until
  // somebody vouches for the fold behind it, and nothing is dropped.
  private heldAggregates: () => readonly Aggregate[] = () => []
  private dropAggregate: (aggregate: Aggregate) => void = () => {}

  constructor(
    private readonly storage: SyncStorage,
    private readonly transport: Transport,
    private readonly policy: SyncPolicy,
  ) {}

  /**
   * syncMiddleware offers every dispatched action here; the policy decides
   * whether it is queued. Buffers until openLocalLog() ran.
   */
  offer(action: PayloadAction<unknown>): void {
    const released = this.policy.releasedAggregateOf(action)
    if (released) this.noteRelease(released)

    const entry = this.policy.toOutboxEntry(action)
    if (!entry) return
    if (this.outbox) {
      void this.outbox.enqueue(entry).then(() => this.requestSync())
    } else {
      this.preStartBuffer.push(entry)
    }
  }

  /**
   * Remembers that this device let go of an aggregate, so no later pull
   * folds its log again and puts it back on screen. Buffered like a queued
   * entry when the log is not open yet.
   */
  private noteRelease(aggregate: Aggregate): void {
    if (this.outbox) {
      void this.outbox.release(aggregate)
    } else {
      this.preStartReleases.push(aggregate)
    }
  }

  /**
   * Opens the local event log. Called at every app start, with or without
   * an identity: before the first account exists the outbox IS the local
   * log, so it has to load and persist even
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
    for (const aggregate of this.preStartReleases) {
      await outbox.release(aggregate)
    }
    this.preStartReleases = []
    this.outbox = outbox
    // Refill the reducer's pending queue from the persisted outbox —
    // without it, offline edits would be invisible after a restart.
    dispatch(
      pendingRestored(
        outbox
          .queuedEntries()
          .map((entry) => this.policy.domainActionOf(entry.wire)),
      ),
    )
  }

  /**
   * Called once per identity (startSync). Opens the log if it is not open
   * yet, allows server contact from now on, and resolves when the first
   * sync cycle is done.
   *
   * @param deviceHoldings What this device holds and how to let go of one —
   * Redux callbacks, installed here because the engine must not know about
   * Redux.
   */
  async start(
    dispatch: Dispatch,
    deviceHoldings?: {
      readonly heldAggregates: () => readonly Aggregate[]
      readonly dropAggregate: (aggregate: Aggregate) => void
    },
  ): Promise<void> {
    if (deviceHoldings) {
      this.heldAggregates = deviceHoldings.heldAggregates
      this.dropAggregate = deviceHoldings.dropAggregate
    }
    if (!this.outbox) await this.openLocalLog(dispatch)
    this.mayContactServer = true
    return this.requestSync()
  }

  /**
   * Called on sign-out (stopSync). Cancels the retry timer, offer()
   * buffers again, requestSync() no-ops — nothing is sent under a dying
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
    this.preStartReleases = []
  }

  /**
   * The single entry point for every sync trigger. Also the resume/reconnect
   * trigger (startSync) and the retry timer. Catches its own rejections —
   * an offline cycle is a warning, not a crash.
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
    const held = this.heldAggregates()
    const heldKeys = new Set(held.map(cursorKeyOf))
    // Holding it again means this device never let go after all — leaving
    // was refused and the list came back.
    await this.reclaimWhatIsHeldAgain(outbox, heldKeys)
    const collections = await this.readCollections()
    const named = collections.flatMap((collection) => collection.named)
    await catchUp({
      cursors: cursorsGuardedByFoldedState(outbox, (aggregate) =>
        heldKeys.has(cursorKeyOf(aggregate)),
      ),
      dispatch,
      fetchAggregates: () => Promise.resolve(named),
      fetchEventsSince: silenceForReleasedAggregates(
        this.transport.fetchEventsSince,
        (aggregate) => outbox.hasReleased(aggregate),
      ),
      domainActionOf: this.policy.domainActionOf,
    })
    this.dropWhatIsNoLongerOurs(outbox, held, collections)
    await this.settleReleasesTheServerAgreesWith(outbox, collections)
  }

  /**
   * What each collection named, for the collections that could be read.
   * A transport that does not distinguish a failed listing from an empty
   * one is taken at its word — everything it returned is everything every
   * collection named, which is what it meant before the distinction existed.
   */
  private async readCollections(): Promise<readonly CollectionListing[]> {
    if (this.transport.listCollections) return this.transport.listCollections()
    const named = await this.transport.fetchAggregates()
    return ALL_KINDS.map((kind) => ({
      kind,
      named: named.filter((aggregate) => aggregate.kind === kind),
    }))
  }

  /** A release only stands while the aggregate is gone from here. */
  private async reclaimWhatIsHeldAgain(
    outbox: Outbox,
    heldKeys: ReadonlySet<string>,
  ): Promise<void> {
    for (const aggregate of outbox.releasedAggregates()) {
      if (heldKeys.has(cursorKeyOf(aggregate))) {
        await outbox.reclaim(aggregate)
      }
    }
  }

  /**
   * Forgets a release once the collection stops naming the aggregate: the
   * server has caught up, and from here on only a fresh invitation can
   * bring it back — which must pull its log from the start. A collection
   * that could not be read says nothing either way, so it settles nothing.
   */
  private async settleReleasesTheServerAgreesWith(
    outbox: Outbox,
    collections: readonly CollectionListing[],
  ): Promise<void> {
    const answered = answersOf(collections)
    for (const aggregate of outbox.releasedAggregates()) {
      if (answered.saysGone(aggregate)) await outbox.reclaim(aggregate)
    }
  }

  /**
   * Lets go of aggregates the server no longer shows us. Being removed from
   * a list is the one membership change whose event never reaches the
   * removed device — access ends with it — so absence from the collection
   * is the only signal there is.
   *
   * Absence only counts from a collection that answered: a listing that
   * failed proves nothing, and reading it as "you are a member of none of
   * these" would take every list off the device over one 500.
   *
   * Guarded by the cursor too: an aggregate the server never confirmed was
   * written here and has not been sent yet. Dropping those would delete a
   * guest's own lists on their first cycle.
   */
  private dropWhatIsNoLongerOurs(
    outbox: Outbox,
    held: readonly Aggregate[],
    collections: readonly CollectionListing[],
  ): void {
    const answered = answersOf(collections)
    for (const aggregate of held) {
      if (!answered.saysGone(aggregate)) continue
      if (outbox.cursorFor(aggregate) === null) continue
      this.dropAggregate(aggregate)
    }
  }

  // The retry timer is just another requestSync trigger.
  private scheduleRetry(): void {
    if (this.retryTimer) return
    const delay = Math.min(
      RETRY_BASE_MS * 2 ** this.failedAttempts,
      RETRY_MAX_MS,
    )
    this.failedAttempts += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.requestSync()
    }, delay)
  }
}

/** The app's engine: device storage + HTTP transport. syncMiddleware
 *  offers actions to it, startSync drives its lifecycle. */
export const syncEngine = new SyncEngine(
  { getItem, setItem },
  httpTransport,
  appSyncPolicy,
)
