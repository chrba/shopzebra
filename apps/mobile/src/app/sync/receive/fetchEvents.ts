// HTTP edge of the receive path: enumerate aggregates, pull event deltas.

import { authFetch, type Fetcher } from '../../authFetch'
import {
  collectionKeyOf,
  collectionPathFor,
  eventsPathFor,
  SYNCED_KINDS,
  type Aggregate,
  type AggregateKind,
} from '../aggregate'

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

/** The aggregates of one kind the caller may sync (membership projection). */
async function fetchAggregatesOfKind(
  kind: AggregateKind,
  fetcher: Fetcher,
): Promise<readonly Aggregate[]> {
  const path = collectionPathFor(kind)
  const response = await fetcher(path)
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}`)
  const body: unknown = await response.json()
  const ids = (body as Readonly<Record<string, unknown>>)[collectionKeyOf(kind)]
  if (!Array.isArray(ids)) throw new Error(`${path} response is not a list`)
  return ids
    .filter((id): id is string => typeof id === 'string')
    .map((id) => ({ kind, id }))
}

/**
 * Everything the caller may sync, across all kinds. Called at the start of
 * every catch-up. One unreachable collection is reported and skipped rather
 * than failing the whole cycle — the same isolation the per-aggregate pull
 * uses, so a broken recipes endpoint never stops lists from syncing.
 */
export async function fetchAggregates(
  fetcher: Fetcher = authFetch,
): Promise<readonly Aggregate[]> {
  const perKind = await Promise.all(
    SYNCED_KINDS.map(async (kind) => {
      try {
        return await fetchAggregatesOfKind(kind, fetcher)
      } catch (error: unknown) {
        console.warn(`sync: listing ${kind} aggregates failed`, error)
        return []
      }
    }),
  )
  return perKind.flat()
}

/**
 * Events after `since` (whole log when null). Called per aggregate
 * during catch-up. Malformed events are dropped, never folded.
 */
export async function fetchEventsSince(
  aggregate: Aggregate,
  since: string | null,
  fetcher: Fetcher = authFetch,
): Promise<readonly WireEvent[]> {
  const path = eventsPathFor(aggregate)
  const query = since ? `?since=${since}` : ''
  const response = await fetcher(`${path}${query}`)
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}`)
  const body: unknown = await response.json()
  const events = (body as { readonly events?: unknown }).events
  if (!Array.isArray(events)) throw new Error('events response is not a list')
  return events.filter(isWireEvent)
}
