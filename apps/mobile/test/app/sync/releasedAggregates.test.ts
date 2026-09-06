// What this device let go of: the declaration that says so, the bookkeeping
// that outlives a restart, and the silence it buys on the receive path.

import { describe, expect, test } from 'vitest'
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'
import type { Aggregate } from '@/app/sync/aggregate'
import { Outbox, SYNC_STORAGE_KEY, type SyncStorage } from '@/app/sync/outbox'
import { silenceForReleasedAggregates } from '@/app/sync/receive/silenceForReleased'
import type { WireEvent } from '@/app/sync/wire'
import {
  listDropped,
  listRenamed,
  listRestored,
} from '@/features/lists/domain/listsSlice'
import { recipeDropped } from '@/features/recipes/domain/recipesSlice'

const groceries: Aggregate = { kind: 'list', id: 'l1' }
const bolognese: Aggregate = { kind: 'recipe', id: 'r1' }

const own = <A extends { readonly type: string }>(action: A) => ({
  ...action,
  meta: { eventId: 'e1', deviceId: 'd1' },
})

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  const storage: SyncStorage & { readonly data: Map<string, string> } = {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
  return storage
}

describe('which action lets go of which aggregate', () => {
  test('dropping a list lets go of that list', () => {
    expect(
      appSyncPolicy.releasedAggregateOf(own(listDropped({ listId: 'l1' }))),
    ).toEqual(groceries)
  })

  test('dropping a recipe lets go of that recipe', () => {
    expect(
      appSyncPolicy.releasedAggregateOf(own(recipeDropped({ recipeId: 'r1' }))),
    ).toEqual(bolognese)
  })

  test('everything else lets go of nothing', () => {
    expect(
      appSyncPolicy.releasedAggregateOf(
        own(listRenamed({ listId: 'l1', name: 'Großeinkauf' })),
      ),
    ).toBeNull()
    expect(
      appSyncPolicy.releasedAggregateOf(
        own(
          listRestored({
            list: {
              id: 'l1',
              name: 'Wocheneinkauf',
              ownerId: 'eiszebra',
              memberIds: ['eiszebra'],
            },
          }),
        ),
      ),
    ).toBeNull()
  })

  // Letting go is not a send: the log has no event for it, and the server
  // hears about the leave through its own command, not through the outbox.
  test('letting go never queues anything', () => {
    expect(
      appSyncPolicy.toOutboxEntry(own(listDropped({ listId: 'l1' }))),
    ).toBeNull()
  })
})

describe('the bookkeeping of what was let go of', () => {
  test('remembers a release and forgets it again', async () => {
    const outbox = await Outbox.load(memoryStorage())

    expect(outbox.hasReleased(groceries)).toBe(false)

    await outbox.release(groceries)
    expect(outbox.hasReleased(groceries)).toBe(true)
    expect(outbox.releasedAggregates()).toEqual([groceries])

    await outbox.reclaim(groceries)
    expect(outbox.hasReleased(groceries)).toBe(false)
  })

  test('keeps the two kinds apart even under the same id', async () => {
    const outbox = await Outbox.load(memoryStorage())

    await outbox.release({ kind: 'list', id: 'same' })

    expect(outbox.hasReleased({ kind: 'recipe', id: 'same' })).toBe(false)
  })

  // The window in which the server still names the list can outlast the
  // app: closing it must not undo the leave.
  test('outlives a restart', async () => {
    const storage = memoryStorage()
    const before = await Outbox.load(storage)
    await before.release(groceries)

    const after = await Outbox.load(storage)

    expect(after.hasReleased(groceries)).toBe(true)
  })

  test('a blob from before this existed simply has no releases', async () => {
    const outbox = await Outbox.load(
      memoryStorage({
        [SYNC_STORAGE_KEY]: JSON.stringify({
          queue: [],
          cursorByAggregate: { 'list:l1': '42' },
        }),
      }),
    )

    expect(outbox.releasedAggregates()).toEqual([])
    expect(outbox.cursorFor(groceries)).toBe('42')
  })
})

describe('the receive path around a released aggregate', () => {
  const anEvent: WireEvent = {
    type: 'lists/listRenamed',
    payload: { listId: 'l1', name: 'Großeinkauf' },
    meta: {
      eventId: 'e9',
      deviceId: 'd-other',
      userId: 'eiszebra',
      position: '00000000000000000009',
    },
  }

  test('asks the server nothing about it', async () => {
    const asked: string[] = []
    const source = silenceForReleasedAggregates(
      (aggregate) => {
        asked.push(aggregate.id)
        return Promise.resolve([anEvent])
      },
      (aggregate) => aggregate.id === 'l1',
    )

    expect(await source(groceries, null)).toEqual([])
    expect(asked).toEqual([])
  })

  test('pulls everything else as before', async () => {
    const source = silenceForReleasedAggregates(
      () => Promise.resolve([anEvent]),
      () => false,
    )

    expect(await source(groceries, '5')).toEqual([anEvent])
  })
})
