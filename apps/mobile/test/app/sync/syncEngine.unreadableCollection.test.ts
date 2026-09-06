// Absence from a collection is what makes this device let go. A collection
// that could not be read is absent from nothing — it simply did not answer,
// and reading its silence as "you are a member of none of these" takes every
// list off the device over one 500.

import { describe, expect, it } from 'vitest'
import { SyncEngine } from '@/app/sync/syncEngine'
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'
import type { Aggregate } from '@/app/sync/aggregate'
import type {
  CollectionListing,
  SendResult,
  Transport,
} from '@/app/sync/transport'

const groceries: Aggregate = { kind: 'list', id: 'l1' }
const bolognese: Aggregate = { kind: 'recipe', id: 'r1' }

/** A device that already folded both — cursors on disk, trees in memory. */
const seededWithCursors = {
  shopzebra_sync: JSON.stringify({
    queue: [],
    cursorByAggregate: { 'list:l1': '42', 'recipe:r1': '7' },
  }),
}

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

/** A server whose collections answer exactly this, and no others. */
function answering(collections: readonly CollectionListing[]): Transport {
  const named = collections.flatMap((collection) => collection.named)
  return {
    sendEntry: () => Promise.resolve<SendResult>({ outcome: 'confirmed' }),
    fetchAggregates: () => Promise.resolve(named),
    listCollections: () => Promise.resolve(collections),
    fetchEventsSince: () => Promise.resolve([]),
  }
}

async function dropsOf(
  transport: Transport,
  held: readonly Aggregate[],
): Promise<readonly Aggregate[]> {
  const dropped: Aggregate[] = []
  const engine = new SyncEngine(
    memoryStorage(seededWithCursors),
    transport,
    appSyncPolicy,
  )
  await engine.start(() => undefined, {
    heldAggregates: () => held,
    dropAggregate: (aggregate) => dropped.push(aggregate),
  })
  return dropped
}

describe('a collection that could not be read', () => {
  it('never costs the device what it holds of that kind', async () => {
    const dropped = await dropsOf(
      answering([{ kind: 'recipe', named: [bolognese] }]),
      [groceries, bolognese],
    )

    expect(dropped).toEqual([])
  })

  // The isolation cuts both ways: the healthy collection still gets to say
  // what it no longer names.
  it('does not stop the collection that did answer', async () => {
    const dropped = await dropsOf(
      answering([
        { kind: 'list', named: [groceries] },
        { kind: 'recipe', named: [] },
      ]),
      [groceries, bolognese],
    )

    expect(dropped).toEqual([bolognese])
  })

  it('a collection that answered and named nothing still means let go', async () => {
    const dropped = await dropsOf(
      answering([
        { kind: 'list', named: [] },
        { kind: 'recipe', named: [] },
      ]),
      [groceries, bolognese],
    )

    expect(dropped).toEqual([groceries, bolognese])
  })

  // A transport from before the distinction existed says only what it
  // returned. Taking it at its word keeps the old behaviour exactly.
  it('a transport that does not distinguish is taken at its word', async () => {
    const withoutListings: Transport = {
      sendEntry: () => Promise.resolve<SendResult>({ outcome: 'confirmed' }),
      fetchAggregates: () => Promise.resolve([bolognese]),
      fetchEventsSince: () => Promise.resolve([]),
    }

    const dropped = await dropsOf(withoutListings, [groceries, bolognese])

    expect(dropped).toEqual([groceries])
  })
})
