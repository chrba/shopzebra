// The HTTP edge of the sync engine. Classifies outcomes so the flush
// loop can decide: retry (network/5xx), drop (4xx rejection) or done.
// The server dedupes on meta.eventId, so resending after a lost ack
// is safe (sync-engine.md §4).

import { authFetch } from '../authFetch'
import { type OutboxEntry } from './outbox'

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

export type SendResult =
  | { readonly outcome: 'confirmed' }
  | { readonly outcome: 'retry' }
  | { readonly outcome: 'rejected'; readonly status: number }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

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

export async function sendEntry(
  entry: OutboxEntry,
  fetcher: Fetcher = authFetch,
): Promise<SendResult> {
  const path =
    entry.kind === 'event' ? `/lists/${entry.listId}/events` : entry.path
  const wire = entry.kind === 'event' ? entry.action : entry.wire
  try {
    const response = await fetcher(path, {
      method: 'POST',
      body: JSON.stringify({
        type: wire.type,
        payload: wire.payload,
        meta: wire.meta,
      }),
    })
    if (response.ok) return { outcome: 'confirmed' }
    if (response.status >= 400 && response.status < 500) {
      return { outcome: 'rejected', status: response.status }
    }
    return { outcome: 'retry' }
  } catch {
    return { outcome: 'retry' }
  }
}

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

export async function fetchEventsSince(
  listId: string,
  since: string | null,
  fetcher: Fetcher = authFetch,
): Promise<readonly WireEvent[]> {
  const query = since ? `?since=${since}` : ''
  const response = await fetcher(`/lists/${listId}/events${query}`)
  if (!response.ok) {
    throw new Error(`GET /lists/${listId}/events → ${response.status}`)
  }
  const body: unknown = await response.json()
  const events = (body as { readonly events?: unknown }).events
  if (!Array.isArray(events)) throw new Error('events response is not a list')
  return events.filter(isWireEvent)
}
