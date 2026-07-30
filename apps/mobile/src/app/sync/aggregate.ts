// Everything the engine knows about aggregates lives in this file.
// A new aggregate kind (recipes, plans) extends these functions — nothing else.

import type { PayloadAction } from '../createSlice'

/**
 * Aggregate a synced action belongs to, or null for local-only actions
 * (e.g. hydration). All list-aggregate events carry a listId, regardless
 * of which slice dispatches them (services/events.md).
 */
export function aggregateIdOf(action: PayloadAction<unknown>): string | null {
  const payload = action.payload
  if (payload === null || typeof payload !== 'object') return null
  const listId = (payload as { readonly listId?: unknown }).listId
  return typeof listId === 'string' ? listId : null
}

/** Event-log endpoint of an aggregate. Called at enqueue time and by catch-up. */
export function eventsPathFor(aggregateId: string): string {
  return `/lists/${aggregateId}/events`
}
