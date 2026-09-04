import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import { Outbox, type SyncStorage } from '@/app/sync/outbox'
import { isEventsConfirmed, type ConfirmedEvent } from '@/app/sync/withSync'
import type { WireEvent } from '@/app/sync/receive/fetchEvents'
import { catchUp } from '@/app/sync/receive/catchUp'
import type { Aggregate } from '@/app/sync/aggregate'

const list1: Aggregate = { kind: 'list', id: 'l1' }

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
      fetchAggregates: () => Promise.resolve([list1]),
      domainPayloadOf: (_type, payload) => ({ ...payload }),
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
    expect(outbox.cursorFor(list1)).toBe('00000000000000000002')
  })

  it('includes own events in the batch — the reducer confirms them, not this file', async () => {
    const outbox = await Outbox.load(memoryStorage())
    const dispatched: PayloadAction<unknown>[] = []
    await catchUp({
      ledger: outbox,
      dispatch: (action) => dispatched.push(action),
      fetchAggregates: () => Promise.resolve([list1]),
      domainPayloadOf: (_type, payload) => ({ ...payload }),
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
    expect(outbox.cursorFor(list1)).toBe('00000000000000000002')
  })

  it('passes the stored cursor to the fetcher and isolates per-aggregate failures', async () => {
    const outbox = await Outbox.load(memoryStorage())
    await outbox.advanceCursor(list1, '00000000000000000005')
    const asked: (string | null)[] = []
    await catchUp({
      ledger: outbox,
      dispatch: () => undefined,
      fetchAggregates: () =>
        Promise.resolve([{ kind: 'list', id: 'broken' } as const, list1]),
      domainPayloadOf: (_type, payload) => ({ ...payload }),
      fetchEventsSince: (aggregate, since) => {
        if (aggregate.id === 'broken') return Promise.reject(new Error('boom'))
        asked.push(since)
        return Promise.resolve([])
      },
    })
    expect(asked).toEqual(['00000000000000000005'])
  })

  it('pulls a recipe from its own log, not from the list routes', async () => {
    const outbox = await Outbox.load(memoryStorage())
    const recipe: Aggregate = { kind: 'recipe', id: 'bolo' }
    const pulled: Aggregate[] = []
    await catchUp({
      ledger: outbox,
      dispatch: () => undefined,
      fetchAggregates: () => Promise.resolve([list1, recipe]),
      domainPayloadOf: (_type, payload) => ({ ...payload }),
      fetchEventsSince: (aggregate) => {
        pulled.push(aggregate)
        return Promise.resolve([])
      },
    })
    expect(pulled).toEqual([list1, recipe])
  })
})
