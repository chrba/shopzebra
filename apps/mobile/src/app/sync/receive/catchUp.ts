// Incremental pull: per aggregate, fetch everything behind the cursor and
// hand it to the withSync reducer as ONE confirmed batch. Own events are
// included — the reducer folds them into `confirmed` at their server
// position and drops them from `pending` (the rebase dedups, not this file).

import type { PayloadAction } from '../../createSlice'
import type { ReceiveLedger } from '../outbox'
import { eventsConfirmed, type ConfirmedEvent } from '../withSync'
import type { WireEvent } from './fetchEvents'
import { toLocalAction } from './toLocalAction'

export type CatchUpDeps = {
  readonly ledger: ReceiveLedger
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly fetchListIds: () => Promise<readonly string[]>
  readonly fetchEventsSince: (
    aggregateId: string,
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

/**
 * Called at engine start, on app resume and on network reconnect.
 * Failures are isolated per aggregate — one broken list never blocks the rest.
 */
export async function catchUp(deps: CatchUpDeps): Promise<void> {
  const listIds = await deps.fetchListIds()
  for (const listId of listIds) {
    try {
      // Delivery order is not guaranteed; the server position is canonical.
      const incoming = [
        ...(await deps.fetchEventsSince(listId, deps.ledger.cursorFor(listId))),
      ].sort(byPosition)
      const last = incoming.at(-1)
      if (!last) continue
      deps.dispatch(eventsConfirmed(incoming.map(toConfirmedEvent)))
      // Only after dispatching — the cursor must never pass unfolded events.
      await deps.ledger.advanceCursor(listId, last.meta.position)
    } catch (error: unknown) {
      console.warn(`sync: catch-up for ${listId} failed`, error)
    }
  }
}
