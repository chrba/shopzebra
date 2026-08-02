// The sync-membership predicate, shared by the send path (what enters the
// outbox) and by withSync (what enters the pending queue). One source of
// truth — the two must never disagree.

import { belongsToSyncedSlice, type PayloadAction } from '../createSlice'
import { aggregateOf } from './aggregate'

/**
 * True for local domain events that must reach the server log. Excludes
 * server echoes (meta.remote) and local-only actions of synced slices
 * (hydration — no aggregate id). Called on every dispatch, by
 * toOutboxEntry and by the withSync reducer.
 */
export function needsSync(action: PayloadAction<unknown>): boolean {
  if (!action.meta || action.meta.remote) return false
  return belongsToSyncedSlice(action.type) && aggregateOf(action) !== null
}
