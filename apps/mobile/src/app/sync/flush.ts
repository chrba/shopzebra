// Single-flight drain of the outbox. Order matters per aggregate, so
// there is never more than one send in flight. Retry only on network
// and 5xx; a 4xx rejection leaves the queue for good — otherwise one
// rejected event blocks the queue forever (sync-engine.md §4).

import { Outbox, entryEventId, type OutboxEntry } from './outbox'
import type { SendResult } from './transport'

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

export type Flusher = { readonly flush: () => void }

export function createFlusher(
  outbox: Outbox,
  send: (entry: OutboxEntry) => Promise<SendResult>,
): Flusher {
  // Closure state by design: single-flight guard and backoff level.
  let draining = false
  let failedAttempts = 0

  async function drain(): Promise<void> {
    if (draining) return
    draining = true
    try {
      for (let head = outbox.head(); head !== null; head = outbox.head()) {
        const result = await send(head)
        if (result.outcome === 'retry') {
          const delay = Math.min(
            RETRY_BASE_MS * 2 ** failedAttempts,
            RETRY_MAX_MS,
          )
          failedAttempts += 1
          setTimeout(() => void drain(), delay)
          return
        }
        failedAttempts = 0
        if (result.outcome === 'rejected') {
          console.warn(
            `sync: server rejected ${entryEventId(head)} (${result.status}) — dropped`,
          )
          await outbox.dropHead()
        } else {
          await outbox.confirmHead()
        }
      }
    } finally {
      draining = false
    }
  }

  return { flush: () => void drain() }
}
