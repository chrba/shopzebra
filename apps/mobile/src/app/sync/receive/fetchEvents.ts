// HTTP edge of the receive path: enumerate aggregates, pull event deltas.

import { authFetch, type Fetcher } from '../../authFetch'
import { eventsPathFor } from '../aggregate'

/** Server event in wire format — same shape as a Redux action. */
export type WireEvent = {
  readonly type: string
  readonly payload: Record<string, unknown>
  readonly meta: {
    readonly eventId: string
    readonly deviceId: string
    readonly userId: string
    readonly position: string
  }
}

function isWireEvent(candidate: unknown): candidate is WireEvent {
  if (candidate === null || typeof candidate !== 'object') return false
  const event = candidate as {
    readonly type?: unknown
    readonly payload?: unknown
    readonly meta?: { readonly eventId?: unknown; readonly position?: unknown }
  }
  return (
    typeof event.type === 'string' &&
    typeof event.payload === 'object' &&
    typeof event.meta?.eventId === 'string' &&
    typeof event.meta?.position === 'string'
  )
}

/**
 * Aggregates the caller may sync (server membership projection).
 * Called at the start of every catch-up.
 */
export async function fetchListIds(
  fetcher: Fetcher = authFetch,
): Promise<readonly string[]> {
  const response = await fetcher('/lists')
  if (!response.ok) throw new Error(`GET /lists → ${response.status}`)
  const body: unknown = await response.json()
  const lists = (body as { readonly lists?: unknown }).lists
  if (!Array.isArray(lists)) throw new Error('lists response is not a list')
  return lists.filter((id): id is string => typeof id === 'string')
}

/**
 * Events after `since` (whole log when null). Called per aggregate
 * during catch-up. Malformed events are dropped, never folded.
 */
export async function fetchEventsSince(
  aggregateId: string,
  since: string | null,
  fetcher: Fetcher = authFetch,
): Promise<readonly WireEvent[]> {
  const query = since ? `?since=${since}` : ''
  const response = await fetcher(`${eventsPathFor(aggregateId)}${query}`)
  if (!response.ok) {
    throw new Error(`GET ${eventsPathFor(aggregateId)} → ${response.status}`)
  }
  const body: unknown = await response.json()
  const events = (body as { readonly events?: unknown }).events
  if (!Array.isArray(events)) throw new Error('events response is not a list')
  return events.filter(isWireEvent)
}
