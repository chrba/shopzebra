import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import { Outbox, type OutboxEntry, type SyncStorage } from '@/app/sync/outbox'
import type { SendResult } from '@/app/sync/send/sendEntry'
import { createFlusher } from '@/app/sync/send/flush'

function memoryStorage(): SyncStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

function entry(eventId: string): OutboxEntry {
  const wire: PayloadAction<unknown> = {
    type: 'shopping/itemAdded',
    payload: { listId: 'l1' },
    meta: { eventId, deviceId: 'd1' },
  }
  return { path: '/lists/l1/events', wire }
}

async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

describe('createFlusher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('drains the queue in order on success', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('e1'))
    await outbox.enqueue(entry('e2'))
    const sent: string[] = []
    const flusher = createFlusher(
      outbox,
      (queued) => {
        sent.push(queued.wire.meta?.eventId ?? '')
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      () => undefined,
    )
    flusher.flush()
    await flushMicrotasks()
    expect(sent).toEqual(['e1', 'e2'])
    expect(outbox.size()).toBe(0)
  })

  it('drops rejected entries, reports them and continues with the next', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('bad'))
    await outbox.enqueue(entry('good'))
    const results: SendResult[] = [
      { outcome: 'rejected', status: 422 },
      { outcome: 'confirmed' },
    ]
    const rejected: string[] = []
    const flusher = createFlusher(
      outbox,
      () => Promise.resolve(results.shift()!),
      (eventId) => rejected.push(eventId),
    )
    flusher.flush()
    await flushMicrotasks()
    expect(outbox.size()).toBe(0)
    expect(rejected).toEqual(['bad'])
  })

  it('retries with exponential backoff and keeps the entry at the head', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('e1'))
    let attempts = 0
    const flusher = createFlusher(
      outbox,
      () => {
        attempts += 1
        return Promise.resolve<SendResult>(
          attempts < 3 ? { outcome: 'retry' } : { outcome: 'confirmed' },
        )
      },
      () => undefined,
    )
    flusher.flush()
    await flushMicrotasks()
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(attempts).toBe(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(attempts).toBe(3)
    expect(outbox.size()).toBe(0)
  })
})
