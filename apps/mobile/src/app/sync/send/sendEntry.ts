// HTTP edge of the send path — no routing: every entry carries its path.

import { authFetch, type Fetcher } from '../../authFetch'
import type { OutboxEntry } from '../outbox'

export type SendResult =
  | { readonly outcome: 'confirmed' }
  | { readonly outcome: 'retry' }
  | { readonly outcome: 'rejected'; readonly status: number }

/**
 * Posts one entry. Called by drainOutbox for the queue head.
 * Classifies the outcome: confirmed (2xx), rejected (4xx → drop),
 * retry (network/5xx). Resending is safe — the server dedupes on eventId.
 */
export async function sendEntry(
  entry: OutboxEntry,
  fetcher: Fetcher = authFetch,
): Promise<SendResult> {
  try {
    const response = await fetcher(entry.path, {
      method: 'POST',
      body: JSON.stringify({
        type: entry.wire.type,
        payload: entry.wire.payload,
        meta: entry.wire.meta,
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
