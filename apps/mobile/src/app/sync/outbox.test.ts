import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '../createSlice'
import {
  Outbox,
  entryEventId,
  type OutboxEntry,
  type SyncStorage,
} from './outbox'

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
  const action: PayloadAction<unknown> = {
    type: 'shopping/itemAdded',
    payload: { listId, itemId: 'apples' },
    meta: { eventId, deviceId: 'device-1' },
  }
  return { kind: 'event', listId, action }
}

describe('Outbox', () => {
  it('starts empty and queues FIFO', async () => {
    const outbox = await Outbox.load(memoryStorage())
    expect(outbox.head()).toBeNull()
    await outbox.enqueue(eventEntry('e1'))
    await outbox.enqueue(eventEntry('e2'))
    expect(outbox.size()).toBe(2)
    expect(entryEventId(outbox.head()!)).toBe('e1')
  })

  it('survives a reload from the same storage', async () => {
    const storage = memoryStorage()
    const first = await Outbox.load(storage)
    await first.enqueue(eventEntry('e1'))
    const second = await Outbox.load(storage)
    expect(second.size()).toBe(1)
    expect(entryEventId(second.head()!)).toBe('e1')
  })

  it('confirmHead removes the head and records it as applied', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(eventEntry('e1'))
    await outbox.confirmHead()
    expect(outbox.head()).toBeNull()
    expect(outbox.hasApplied('e1')).toBe(true)
  })

  it('dropHead removes the head without an applied record', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(eventEntry('e1'))
    await outbox.dropHead()
    expect(outbox.head()).toBeNull()
    expect(outbox.hasApplied('e1')).toBe(false)
  })

  it('advanceCursor sets the cursor and prunes passed applied ids', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.enqueue(eventEntry('e1'))
    await outbox.confirmHead()
    expect(outbox.cursorFor('list-1')).toBeNull()
    await outbox.advanceCursor('list-1', '00000000000000000042', ['e1'])
    expect(outbox.cursorFor('list-1')).toBe('00000000000000000042')
    expect(outbox.hasApplied('e1')).toBe(false)
  })

  it('falls back to empty state on corrupted storage', async () => {
    const outbox = await Outbox.load(memoryStorage('{not json'))
    expect(outbox.head()).toBeNull()
    expect(outbox.size()).toBe(0)
  })
})
