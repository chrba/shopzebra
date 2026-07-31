// One pass over the outbox: send head-by-head, in order, and report what
// happened. No timers, no callbacks — retry pacing and the follow-up pull
// are the engine's sync cycle's job.

import { eventIdOf, type OutboxEntry, type SendQueue } from '../outbox'
import type { SendResult } from './sendEntry'

export type DrainResult = {
  readonly delivered: number
  readonly rejected: readonly string[]
  readonly blocked: boolean
}

/**
 * Sends queued entries until the queue is empty or the head needs a retry
 * (network/5xx — the entry stays at the head, `blocked: true`). 4xx entries
 * are dropped for good and reported via `rejected` so the engine can roll
 * their optimistic effect back. Called only from the engine's sync cycle,
 * which runs one at a time — per-aggregate event order stays intact.
 */
export async function drainOutbox(
  queue: SendQueue,
  send: (entry: OutboxEntry) => Promise<SendResult>,
): Promise<DrainResult> {
  let delivered = 0
  const rejected: string[] = []
  for (let head = queue.head(); head !== null; head = queue.head()) {
    const result = await send(head)
    if (result.outcome === 'retry') {
      return { delivered, rejected, blocked: true }
    }
    if (result.outcome === 'rejected') {
      // One bad event must not block the queue.
      console.warn(
        `sync: server rejected ${eventIdOf(head)} (${result.status}) — dropped`,
      )
      rejected.push(eventIdOf(head))
    } else {
      delivered += 1
    }
    await queue.removeHead()
  }
  return { delivered, rejected, blocked: false }
}
