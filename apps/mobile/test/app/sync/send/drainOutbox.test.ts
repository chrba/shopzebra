import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import { Outbox, type OutboxEntry, type SyncStorage } from '@/app/sync/outbox'
import type { SendResult } from '@/app/sync/send/sendEntry'
import { drainOutbox } from '@/app/sync/send/drainOutbox'

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

describe('drainOutbox', () => {
  it('sends the queue in order and reports the delivered count', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('e1'))
    await outbox.enqueue(entry('e2'))
    const sent: string[] = []

    const result = await drainOutbox(outbox, (queued) => {
      sent.push(queued.wire.meta?.eventId ?? '')
      return Promise.resolve<SendResult>({ outcome: 'confirmed' })
    })

    expect(sent).toEqual(['e1', 'e2'])
    expect(outbox.size()).toBe(0)
    expect(result).toEqual({ delivered: 2, rejected: [], blocked: false })
  })

  it('drops rejected entries, reports them and continues with the next', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('bad'))
    await outbox.enqueue(entry('good'))
    const results: SendResult[] = [
      { outcome: 'rejected', status: 422 },
      { outcome: 'confirmed' },
    ]

    const result = await drainOutbox(outbox, () =>
      Promise.resolve(results.shift()!),
    )

    expect(outbox.size()).toBe(0)
    expect(result).toEqual({ delivered: 1, rejected: ['bad'], blocked: false })
  })

  it('stops at a retry and keeps the entry at the head', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(entry('e1'))
    await outbox.enqueue(entry('e2'))

    const result = await drainOutbox(outbox, () =>
      Promise.resolve<SendResult>({ outcome: 'retry' }),
    )

    expect(outbox.size()).toBe(2)
    expect(outbox.head()?.wire.meta?.eventId).toBe('e1')
    expect(result).toEqual({ delivered: 0, rejected: [], blocked: true })
  })

  it('reports an empty queue as nothing delivered and not blocked', async () => {
    const outbox = await Outbox.load(memoryStorage())

    const result = await drainOutbox(outbox, () =>
      Promise.resolve<SendResult>({ outcome: 'confirmed' }),
    )

    expect(result).toEqual({ delivered: 0, rejected: [], blocked: false })
  })
})
