import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import {
  Outbox,
  eventIdOf,
  type OutboxEntry,
  type SyncStorage,
} from '@/app/sync/outbox'

function memoryStorage(
  initial?: string,
): SyncStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set('shopzebra_sync', initial)
  return {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

function eventEntry(eventId: string, listId = 'list-1'): OutboxEntry {
  const wire: PayloadAction<unknown> = {
    type: 'shopping/itemAdded',
    payload: { listId, itemId: 'apples' },
    meta: { eventId, deviceId: 'device-1' },
  }
  return { path: `/lists/${listId}/events`, wire }
}

describe('Outbox', () => {
  it('starts empty and queues FIFO', async () => {
    const outbox = await Outbox.load(memoryStorage())
    expect(outbox.head()).toBeNull()
    await outbox.enqueue(eventEntry('e1'))
    await outbox.enqueue(eventEntry('e2'))
    expect(outbox.size()).toBe(2)
    expect(eventIdOf(outbox.head()!)).toBe('e1')
  })

  it('survives a reload from the same storage', async () => {
    const storage = memoryStorage()
    const first = await Outbox.load(storage)
    await first.enqueue(eventEntry('e1'))
    const second = await Outbox.load(storage)
    expect(second.size()).toBe(1)
    expect(eventIdOf(second.head()!)).toBe('e1')
  })

  it('removeHead removes the head', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(eventEntry('e1'))
    await outbox.removeHead()
    expect(outbox.head()).toBeNull()
  })

  it('queuedEntries returns the queue in order', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(eventEntry('e1'))
    await outbox.enqueue(eventEntry('e2'))
    expect(outbox.queuedEntries().map(eventIdOf)).toEqual(['e1', 'e2'])
  })

  it('advanceCursor sets the cursor per aggregate', async () => {
    const outbox = await Outbox.load(memoryStorage())
    expect(outbox.cursorFor('list-1')).toBeNull()
    await outbox.advanceCursor('list-1', '00000000000000000042')
    expect(outbox.cursorFor('list-1')).toBe('00000000000000000042')
  })

  it('falls back to empty state on corrupted storage', async () => {
    const outbox = await Outbox.load(memoryStorage('{not json'))
    expect(outbox.head()).toBeNull()
    expect(outbox.size()).toBe(0)
  })

  it('recovers from storage write failure and continues persisting', async () => {
    let failCount = 1
    const storage = {
      data: new Map<string, string>(),
      getItem: (key: string) => Promise.resolve(storage.data.get(key) ?? null),
      setItem: (key: string, value: string) => {
        if (failCount > 0) {
          failCount--
          return Promise.reject(new Error('storage write failed'))
        }
        storage.data.set(key, value)
        return Promise.resolve()
      },
    } as SyncStorage & { readonly data: Map<string, string> }

    const outbox = await Outbox.load(storage)
    // First write fails
    await outbox.enqueue(eventEntry('e1'))
    // Second write succeeds (should contain both e1 and e2)
    await outbox.enqueue(eventEntry('e2'))

    // Verify both entries are in the final storage state
    const stored = storage.data.get('shopzebra_sync')
    expect(stored).toBeDefined()
    const parsed = JSON.parse(stored!)
    expect(parsed.queue).toHaveLength(2)
    expect(parsed.queue[0].wire.meta.eventId).toBe('e1')
    expect(parsed.queue[1].wire.meta.eventId).toBe('e2')
  })
})
