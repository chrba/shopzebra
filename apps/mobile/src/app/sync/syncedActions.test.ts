import { describe, expect, it } from 'vitest'
import { toLocalAction, toOutboxEntry } from './syncedActions'
import { itemAdded } from '../../features/shopping/domain/shoppingSlice'
import { listCreated } from '../../features/lists/domain/listsSlice'
import type { WireEvent } from './transport'

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
    expect(entry).toEqual({ kind: 'event', listId: 'list-1', action })
  })

  it('maps listCreated to the class-2 command endpoint with createdBy', () => {
    const action = {
      ...listCreated({ listId: 'l1', name: 'REWE', ownerId: 'user-1' }),
      meta,
    }
    const entry = toOutboxEntry(action)
    expect(entry).toEqual({
      kind: 'command',
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

describe('toLocalAction', () => {
  const wireMeta = {
    eventId: 'e1',
    deviceId: 'other',
    userId: 'u2',
    position: '00000000000000000003',
  }

  it('marks events as remote so they are not sent back', () => {
    const event: WireEvent = {
      type: 'shopping/itemChecked',
      payload: { listId: 'l1', itemId: 'x' },
      meta: wireMeta,
    }
    expect(toLocalAction(event)).toEqual({
      type: 'shopping/itemChecked',
      payload: { listId: 'l1', itemId: 'x' },
      meta: { ...wireMeta, remote: true },
    })
  })

  it('translates createdBy back to ownerId for listCreated', () => {
    const event: WireEvent = {
      type: 'lists/listCreated',
      payload: { listId: 'l1', name: 'REWE', createdBy: 'u2' },
      meta: wireMeta,
    }
    expect(toLocalAction(event).payload).toEqual({
      listId: 'l1',
      name: 'REWE',
      ownerId: 'u2',
    })
  })
})
