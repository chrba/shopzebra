// Incremental pull: per aggregate, fetch everything behind the cursor and
// hand it to the withSync reducer as ONE confirmed batch. Own events are
// included — the reducer folds them into `confirmed` at their server
// position and drops them from `pending` (the rebase dedups, not this file).

import type { PayloadAction } from '../../createSlice'
import { cursorKeyOf, type Aggregate } from '../aggregate'
import type { ReceiveLedger } from '../outbox'
import { eventsConfirmed, type ConfirmedEvent } from '../withSync'
import type { WireEvent } from './fetchEvents'
import { toLocalAction } from './toLocalAction'

export type CatchUpDeps = {
  readonly ledger: ReceiveLedger
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly fetchAggregates: () => Promise<readonly Aggregate[]>
  readonly fetchEventsSince: (
    aggregate: Aggregate,
    since: string | null,
  ) => Promise<readonly WireEvent[]>
}

function byPosition(a: WireEvent, b: WireEvent): number {
  return a.meta.position < b.meta.position ? -1 : 1
}

function toConfirmedEvent(event: WireEvent): ConfirmedEvent {
  const local = toLocalAction(event)
  return {
    type: local.type,
    payload: local.payload,
    meta: { ...event.meta, remote: true },
  }
}

/** What the server holds beyond our cursor, in canonical order. */
async function eventsSinceCursor(
  deps: CatchUpDeps,
  aggregate: Aggregate,
): Promise<readonly WireEvent[]> {
  const incoming = await deps.fetchEventsSince(
    aggregate,
    deps.ledger.cursorFor(aggregate),
  )
  // Delivery order is not guaranteed; the server position is canonical.
  return [...incoming].sort(byPosition)
}

/** One dispatch per aggregate, so the reducer rebases once, not per event. */
function foldIntoConfirmedTree(
  deps: CatchUpDeps,
  incoming: readonly WireEvent[],
): void {
  deps.dispatch(eventsConfirmed(incoming.map(toConfirmedEvent)))
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
  await deps.ledger.advanceCursor(aggregate, last.meta.position)
}

/**
 * Called at engine start, on app resume and on network reconnect. Pulls
 * every aggregate the caller may see, whatever its kind.
 * Failures are isolated per aggregate — one broken list never blocks the rest.
 */
export async function catchUp(deps: CatchUpDeps): Promise<void> {
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
}
