// Incremental pull: per list, fetch everything after the cursor and
// fold it in server order. Replaces the old wipe-and-refold bootstrap —
// local state stays on screen, the delta folds in on top.
//
// Stage-1 limits (fixed structurally by the withSync rebase, stage 2):
// concurrent-edit order divergence, and a crash window between fold
// and cursor persist that can re-fold one list's tail (harmless while
// reducers are total and item events are keyed by deterministic ids).

import type { PayloadAction } from '../createSlice'
import type { Outbox } from './outbox'
import type { WireEvent } from './transport'
import { toLocalAction } from './syncedActions'

export type CatchUpDeps = {
  readonly outbox: Outbox
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly fetchListIds: () => Promise<readonly string[]>
  readonly fetchEventsSince: (
    listId: string,
    since: string | null,
  ) => Promise<readonly WireEvent[]>
}

function byPosition(a: WireEvent, b: WireEvent): number {
  return a.meta.position < b.meta.position ? -1 : 1
}

export async function catchUp(deps: CatchUpDeps): Promise<void> {
  const listIds = await deps.fetchListIds()
  for (const listId of listIds) {
    try {
      const incoming = [
        ...(await deps.fetchEventsSince(listId, deps.outbox.cursorFor(listId))),
      ].sort(byPosition)
      for (const event of incoming) {
        if (!deps.outbox.hasApplied(event.meta.eventId)) {
          deps.dispatch(toLocalAction(event))
        }
      }
      const last = incoming.at(-1)
      if (last) {
        await deps.outbox.advanceCursor(
          listId,
          last.meta.position,
          incoming.map((event) => event.meta.eventId),
        )
      }
    } catch (error: unknown) {
      console.warn(`sync: catch-up for ${listId} failed`, error)
    }
  }
}
