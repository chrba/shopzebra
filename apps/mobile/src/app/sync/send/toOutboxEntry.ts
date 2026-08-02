// Policy edge of the send path: decides at dispatch time which actions
// are synced and where they go.

import type { PayloadAction } from '../../createSlice'
import { listCreated } from '../../../features/lists/domain/listsSlice'
import { recipeCreated } from '../../../features/recipes/domain/recipesSlice'
import { aggregateOf, eventsPathFor } from '../aggregate'
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

  // Class-2 commands (sync-engine.md §6): the server validates, claims
  // ownership and writes the event itself. They still travel the outbox,
  // so creating something works offline like everything else.
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

  if (recipeCreated.match(action)) {
    return {
      path: '/recipes',
      wire: {
        type: recipeCreated.type,
        payload: ownerIdToCreatedBy(action.payload),
        meta,
      },
    }
  }

  const aggregate = aggregateOf(action)
  if (!aggregate) return null
  return { path: eventsPathFor(aggregate), wire: action }
}
