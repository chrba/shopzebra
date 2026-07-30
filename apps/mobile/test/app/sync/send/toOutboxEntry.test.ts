import { describe, expect, it } from 'vitest'
import { toOutboxEntry } from '@/app/sync/send/toOutboxEntry'
import { itemAdded } from '@/features/shopping/domain/shoppingSlice'
import { listCreated } from '@/features/lists/domain/listsSlice'

const meta = { eventId: 'e1', deviceId: 'device-1' }

describe('toOutboxEntry', () => {
  it('maps a synced class-1 action to its list log', () => {
    const action = {
      ...itemAdded({
        listId: 'list-1',
        itemId: 'apples',
        name: 'Äpfel',
        quantity: 1,
        unit: 'kg',
        category: 'produce',
        addedBy: 'user-1',
      }),
      meta,
    }
    const entry = toOutboxEntry(action)
    expect(entry).toEqual({ path: '/lists/list-1/events', wire: action })
  })

  it('maps listCreated to the class-2 command endpoint with createdBy', () => {
    const action = {
      ...listCreated({ listId: 'l1', name: 'REWE', ownerId: 'user-1' }),
      meta,
    }
    const entry = toOutboxEntry(action)
    expect(entry).toEqual({
      path: '/lists',
      wire: {
        type: 'lists/listCreated',
        payload: { listId: 'l1', name: 'REWE', createdBy: 'user-1' },
        meta,
      },
    })
  })

  it('ignores remote actions, unsynced slices and payloads without listId', () => {
    const remote = {
      type: 'shopping/itemAdded',
      payload: { listId: 'l1' },
      meta: { ...meta, remote: true },
    }
    expect(toOutboxEntry(remote)).toBeNull()
    expect(
      toOutboxEntry({
        type: 'preferences/themeChanged',
        payload: { listId: 'l1' },
        meta,
      }),
    ).toBeNull()
    expect(
      toOutboxEntry({
        type: 'lists/listsLoaded',
        payload: { lists: [] },
        meta,
      }),
    ).toBeNull()
  })
})
