import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '../createSlice'
import { Outbox, type SyncStorage } from './outbox'
import type { WireEvent } from './transport'
import { catchUp } from './catchUp'

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

function wireEvent(eventId: string, position: string): WireEvent {
  return {
    type: 'shopping/itemChecked',
    payload: { listId: 'l1', itemId: 'x' },
    meta: { eventId, deviceId: 'other', userId: 'u2', position },
  }
}

describe('catchUp', () => {
  it('folds foreign events as remote actions and advances the cursor', async () => {
    const outbox = await Outbox.load(memoryStorage())
    const dispatched: PayloadAction<unknown>[] = []
    await catchUp({
      outbox,
      dispatch: (action) => dispatched.push(action),
      fetchListIds: () => Promise.resolve(['l1']),
      fetchEventsSince: () =>
        Promise.resolve([
          wireEvent('f2', '00000000000000000002'),
          wireEvent('f1', '00000000000000000001'),
        ]),
    })
    expect(dispatched.map((a) => a.meta?.eventId)).toEqual(['f1', 'f2'])
    expect(dispatched.every((a) => a.meta?.remote)).toBe(true)
    expect(outbox.cursorFor('l1')).toBe('00000000000000000002')
  })

  it('skips own already-applied events but still advances past them', async () => {
    const storage = memoryStorage()
    const outbox = await Outbox.load(storage)
    await outbox.enqueue({
      kind: 'event',
      listId: 'l1',
      action: {
        type: 'shopping/itemChecked',
        payload: { listId: 'l1' },
        meta: { eventId: 'mine', deviceId: 'd1' },
      },
    })
    await outbox.confirmHead()
    const dispatched: PayloadAction<unknown>[] = []
    await catchUp({
      outbox,
      dispatch: (action) => dispatched.push(action),
      fetchListIds: () => Promise.resolve(['l1']),
      fetchEventsSince: () =>
        Promise.resolve([
          {
            ...wireEvent('mine', '00000000000000000001'),
            meta: {
              eventId: 'mine',
              deviceId: 'd1',
              userId: 'u1',
              position: '00000000000000000001',
            },
          },
          wireEvent('theirs', '00000000000000000002'),
        ]),
    })
    expect(dispatched.map((a) => a.meta?.eventId)).toEqual(['theirs'])
    expect(outbox.cursorFor('l1')).toBe('00000000000000000002')
    expect(outbox.hasApplied('mine')).toBe(false) // pruned after passing
  })

  it('passes the stored cursor to the fetcher and isolates per-list failures', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.advanceCursor('l1', '00000000000000000005', [])
    const asked: (string | null)[] = []
    await catchUp({
      outbox,
      dispatch: () => undefined,
      fetchListIds: () => Promise.resolve(['broken', 'l1']),
      fetchEventsSince: (listId, since) => {
        if (listId === 'broken') return Promise.reject(new Error('boom'))
        asked.push(since)
        return Promise.resolve([])
      },
    })
    expect(asked).toEqual(['00000000000000000005'])
  })
})
