// Incremental pull: per aggregate, fetch everything behind the cursor and
// hand it to the withSync reducer as ONE confirmed batch. Own events are
// included — the reducer folds them into `confirmed` at their server
// position and drops them from `pending` (the rebase dedups, not this file).

import type { PayloadAction } from '../../createSlice'
import { cursorKeyOf, type Aggregate } from '../aggregate'
import type { Cursors } from '../outbox'
import { eventsConfirmed } from '../withSync'
import type { WireEvent } from '../wire'
import { toConfirmedEvent } from './toConfirmedEvent'

export type CatchUpDeps = {
  readonly cursors: Cursors
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly fetchAggregates: () => Promise<readonly Aggregate[]>
  readonly fetchEventsSince: (
    aggregate: Aggregate,
    since: string | null,
  ) => Promise<readonly WireEvent[]>
  readonly domainActionOf: (
    wire: PayloadAction<unknown>,
  ) => PayloadAction<unknown>
}

function byPosition(a: WireEvent, b: WireEvent): number {
  return a.meta.position < b.meta.position ? -1 : 1
}

/** What the server holds beyond our cursor, in canonical order. */
async function eventsSinceCursor(
  deps: CatchUpDeps,
  aggregate: Aggregate,
): Promise<readonly WireEvent[]> {
  const incoming = await deps.fetchEventsSince(
    aggregate,
    deps.cursors.cursorFor(aggregate),
  )
  // Delivery order is not guaranteed; the server position is canonical.
  return [...incoming].sort(byPosition)
}

/** One dispatch per aggregate, so the reducer rebases once, not per event. */
function foldIntoConfirmedTree(
  deps: CatchUpDeps,
  incoming: readonly WireEvent[],
): void {
  deps.dispatch(
    eventsConfirmed(
      incoming.map((event) => toConfirmedEvent(event, deps.domainActionOf)),
    ),
  )
}

/**
 * Called only after the batch was dispatched — the cursor must never pass
 * events that were not folded, or they are lost for good.
 */
async function advanceCursorPast(
  deps: CatchUpDeps,
  aggregate: Aggregate,
  incoming: readonly WireEvent[],
): Promise<void> {
  const last = incoming.at(-1)
  if (!last) return
  await deps.cursors.advanceCursor(aggregate, last.meta.position)
}

/**
 * The pull step of every sync cycle (SyncEngine.syncOnce), right after the
 * push. Pulls every aggregate the caller may see, whatever its kind.
 * Failures are isolated per aggregate — one broken list never blocks the rest.
 *
 * Returns what the server showed. That set is authoritative about access:
 * anything held locally and missing from it is no longer ours. Acting on
 * that is the caller's business — this file knows nothing about slices.
 */
export async function catchUp(
  deps: CatchUpDeps,
): Promise<readonly Aggregate[]> {
  const aggregates = await deps.fetchAggregates()
  for (const aggregate of aggregates) {
    try {
      const incoming = await eventsSinceCursor(deps, aggregate)
      if (incoming.length === 0) continue
      foldIntoConfirmedTree(deps, incoming)
      await advanceCursorPast(deps, aggregate, incoming)
    } catch (error: unknown) {
      console.warn(`sync: catch-up for ${cursorKeyOf(aggregate)} failed`, error)
    }
  }
  return aggregates
}
