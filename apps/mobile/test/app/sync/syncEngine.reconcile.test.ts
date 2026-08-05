import { describe, expect, it } from 'vitest'
import { SyncEngine } from '@/app/sync/syncEngine'
import type { Aggregate } from '@/app/sync/aggregate'
import type { SendResult, Transport } from '@/app/sync/transport'

/** clientStorage in a Map — the engine persists its outbox through it. */
function memoryStorage(seed: Record<string, string> = {}) {
  const written = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => Promise.resolve(written.get(key) ?? null),
    setItem: (key: string, value: string) => {
      written.set(key, value)
      return Promise.resolve()
    },
  }
}

/** A server that shows exactly these aggregates and holds no events. */
function showing(aggregates: readonly Aggregate[]): Transport {
  return {
    sendEntry: () => Promise.resolve<SendResult>({ outcome: 'confirmed' }),
    fetchAggregates: () => Promise.resolve([...aggregates]),
    fetchEventsSince: () => Promise.resolve([]),
  }
}

const removedList = { kind: 'list', id: 'gone' } as const

/** A device that already folded that list — cursor on disk, tree in memory. */
const seededWithCursor = {
  shopzebra_sync: JSON.stringify({
    queue: [],
    cursorByAggregate: { 'list:gone': '42' },
  }),
}

describe('what the server no longer shows', () => {
  // Being removed from a list is the one membership change whose event
  // never reaches the removed device — access ends with it. So absence
  // from the collection is the only signal, and without acting on it the
  // list sits there forever.
  it('is dropped from this device', async () => {
    const dropped: Aggregate[] = []
    const engine = new SyncEngine(
      memoryStorage(seededWithCursor),
      showing([]),
    )

    await engine.start(() => undefined, {
      heldAggregates: () => [removedList],
      dropAggregate: (aggregate) => dropped.push(aggregate),
    })

    expect(dropped).toEqual([removedList])
  })

  it('stays while the server still shows it', async () => {
    const dropped: Aggregate[] = []
    const engine = new SyncEngine(
      memoryStorage(seededWithCursor),
      showing([removedList]),
    )

    await engine.start(() => undefined, {
      heldAggregates: () => [removedList],
      dropAggregate: (aggregate) => dropped.push(aggregate),
    })

    expect(dropped).toEqual([])
  })

  // A list written on this device before it ever synced has no cursor.
  // Dropping it would delete a guest's own lists on their first cycle.
  it('never touches what the server has not confirmed yet', async () => {
    const dropped: Aggregate[] = []
    const engine = new SyncEngine(memoryStorage(), showing([]))

    await engine.start(() => undefined, {
      heldAggregates: () => [{ kind: 'list', id: 'written-offline' }],
      dropAggregate: (aggregate) => dropped.push(aggregate),
    })

    expect(dropped).toEqual([])
  })
})
