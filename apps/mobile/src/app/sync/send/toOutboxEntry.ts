// Policy edge of the send path: decides at dispatch time which actions
// are synced and where they go.

import type { PayloadAction } from '../../createSlice'
import { listCreated } from '../../../features/lists/domain/listsSlice'
import { aggregateIdOf, eventsPathFor } from '../aggregate'
import { needsSync } from '../needsSync'
import { ownerIdToCreatedBy } from '../wire'
import type { OutboxEntry } from '../outbox'

/**
 * Called by syncMiddleware for every dispatch. Returns the queued send,
 * or null for local-only actions and server echoes (meta.remote) —
 * needsSync is the shared membership decision (also used by withSync).
 */
export function toOutboxEntry(
  action: PayloadAction<unknown>,
): OutboxEntry | null {
  const meta = action.meta
  if (!meta || !needsSync(action)) return null

  // Class-2 command (sync-engine.md §6): the server validates and writes
  // the event itself.
  if (listCreated.match(action)) {
    return {
      path: '/lists',
      wire: {
        type: listCreated.type,
        payload: ownerIdToCreatedBy(action.payload),
        meta,
      },
    }
  }

  const aggregateId = aggregateIdOf(action)
  if (!aggregateId) return null
  return { path: eventsPathFor(aggregateId), wire: action }
}
