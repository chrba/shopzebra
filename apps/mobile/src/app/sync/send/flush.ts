// Single-flight drain of the outbox — one send in flight, so the
// per-aggregate event order is preserved.

import { eventIdOf, type OutboxEntry, type SendQueue } from '../outbox'
import type { SendResult } from './sendEntry'

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

export type Flusher = { readonly flush: () => void }

/**
 * Called once by SyncEngine.start(). flush() fires after every enqueue
 * and at the end of each catch-up; calls during a drain are no-ops.
 * onRejected fires for every 4xx-dropped entry so the engine can discard
 * it from the reducer's pending as well.
 */
export function createFlusher(
  queue: SendQueue,
  send: (entry: OutboxEntry) => Promise<SendResult>,
  onRejected: (eventId: string) => void,
): Flusher {
  let draining = false
  let failedAttempts = 0

  async function drain(): Promise<void> {
    if (draining) return
    draining = true
    try {
      for (let head = queue.head(); head !== null; head = queue.head()) {
        const result = await send(head)
        if (result.outcome === 'retry') {
          // Network/5xx: keep the head, try again after backoff (1s → 30s).
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
          // 4xx: dropped for good — one bad event must not block the queue.
          console.warn(
            `sync: server rejected ${eventIdOf(head)} (${result.status}) — dropped`,
          )
          onRejected(eventIdOf(head))
        }
        await queue.removeHead()
      }
    } finally {
      draining = false
    }
  }

  return { flush: () => void drain() }
}
