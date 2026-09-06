// HTTP edge of the receive path: enumerate aggregates, pull event deltas.

import { authFetch, type Fetcher } from '../../authFetch'
import {
  ALL_KINDS,
  collectionKeyOf,
  collectionPathFor,
  eventsPathFor,
  type Aggregate,
  type AggregateKind,
} from '../aggregate'
import type { WireEvent } from '../wire'

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

/** One collection that could be read, and everything it named the caller a member of. */
export type CollectionListing = {
  readonly kind: AggregateKind
  readonly named: readonly Aggregate[]
}

/**
 * Every collection that could be read, with what it named. Called at the
 * start of every catch-up. One unreachable collection is reported and
 * skipped rather than failing the whole cycle — the same isolation the
 * per-aggregate pull uses, so a broken recipes endpoint never stops lists
 * from syncing.
 *
 * An unreadable collection is **missing** from the answer rather than named
 * as empty, and that difference carries the weight: the engine lets go of
 * everything its collection does not name, so reading a failed call as "you
 * are a member of none of these" would cost the device every list it has on
 * a single 500.
 */
export async function listCollections(
  fetcher: Fetcher = authFetch,
): Promise<readonly CollectionListing[]> {
  const perKind = await Promise.all(
    ALL_KINDS.map(async (kind) => {
      try {
        return { kind, named: await fetchAggregatesOfKind(kind, fetcher) }
      } catch (error: unknown) {
        console.warn(`sync: listing ${kind} aggregates failed`, error)
        return null
      }
    }),
  )
  return perKind.filter(
    (listing): listing is CollectionListing => listing !== null,
  )
}

/**
 * Everything the caller may sync, across all kinds — the flat view of
 * listCollections, for the pull, which only needs to know what to fetch.
 * Whether a kind could be read at all is a question only the letting-go
 * asks, and it asks listCollections.
 */
export async function fetchAggregates(
  fetcher: Fetcher = authFetch,
): Promise<readonly Aggregate[]> {
  const listings = await listCollections(fetcher)
  return listings.flatMap((listing) => listing.named)
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
