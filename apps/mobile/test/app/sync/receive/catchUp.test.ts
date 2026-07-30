import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import { Outbox, type SyncStorage } from '@/app/sync/outbox'
import { isEventsConfirmed, type ConfirmedEvent } from '@/app/sync/withSync'
import type { WireEvent } from '@/app/sync/receive/fetchEvents'
import { catchUp } from '@/app/sync/receive/catchUp'

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

function confirmedEventsOf(
  dispatched: readonly PayloadAction<unknown>[],
): readonly ConfirmedEvent[] {
  return dispatched.flatMap((action) =>
    isEventsConfirmed(action) ? action.payload.events : [],
  )
}

describe('catchUp', () => {
  it('dispatches fetched events as one confirmed batch in position order and advances the cursor', async () => {
    const outbox = await Outbox.load(memoryStorage())
    const dispatched: PayloadAction<unknown>[] = []
    await catchUp({
      ledger: outbox,
      dispatch: (action) => dispatched.push(action),
      fetchListIds: () => Promise.resolve(['l1']),
      fetchEventsSince: () =>
        Promise.resolve([
          wireEvent('f2', '00000000000000000002'),
          wireEvent('f1', '00000000000000000001'),
        ]),
    })
    expect(dispatched).toHaveLength(1)
    const events = confirmedEventsOf(dispatched)
    expect(events.map((event) => event.meta.eventId)).toEqual(['f1', 'f2'])
    expect(events.every((event) => event.meta.remote)).toBe(true)
    expect(outbox.cursorFor('l1')).toBe('00000000000000000002')
  })

  it('includes own events in the batch — the reducer confirms them, not this file', async () => {
    const outbox = await Outbox.load(memoryStorage())
    const dispatched: PayloadAction<unknown>[] = []
    await catchUp({
      ledger: outbox,
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
    const events = confirmedEventsOf(dispatched)
    expect(events.map((event) => event.meta.eventId)).toEqual([
      'mine',
      'theirs',
    ])
    expect(outbox.cursorFor('l1')).toBe('00000000000000000002')
  })

  it('passes the stored cursor to the fetcher and isolates per-list failures', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.advanceCursor('l1', '00000000000000000005')
    const asked: (string | null)[] = []
    await catchUp({
      ledger: outbox,
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
