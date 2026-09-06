import { describe, expect, test } from 'vitest'
import {
  listsReducer,
  listCreated,
  listDropped,
  selectAllLists,
} from '@/features/lists/domain/listsSlice'
import {
  preferencesReducer,
  listPreferencesSet,
  selectAllListPreferences,
} from '@/features/preferences/domain/preferencesSlice'
import {
  shoppingReducer,
  itemAdded,
  selectListItems,
} from '@/features/shopping/domain/shoppingSlice'
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'

const fold = (actions: readonly { type: string }[]) =>
  actions.reduce(
    (state, action) => listsReducer(state, action),
    listsReducer(undefined, { type: '@@INIT' }),
  )

describe('dropping a list', () => {
  test('drops only the list that was left', () => {
    const lists = fold([
      listCreated({ listId: 'l1', name: 'Wocheneinkauf', ownerId: 'chris' }),
      listCreated({ listId: 'l2', name: 'Bäcker', ownerId: 'me' }),
      listDropped({ listId: 'l1' }),
    ])

    expect(selectAllLists({ lists }).map((list) => list.id)).toEqual(['l2'])
  })

  // Whatever ended my membership also ended my access to the log, so the
  // server can never tell me about it — role: 'localEvent' keeps it here.
  test('never reaches the outbox', () => {
    expect(
      appSyncPolicy.reachesServer({
        ...listDropped({ listId: 'l1' }),
        meta: { eventId: 'e1', deviceId: 'd1' },
      }),
    ).toBe(false)
  })

  test('takes the items of that list with it', () => {
    const withItems = shoppingReducer(
      shoppingReducer(undefined, { type: '@@INIT' }),
      itemAdded({
        listId: 'l1',
        itemId: 'apples',
        name: 'Äpfel',
        quantity: 1,
        unit: 'kg',
        category: 'fruits-vegetables',
        addedBy: 'me',
      }),
    )

    const shopping = shoppingReducer(withItems, listDropped({ listId: 'l1' }))

    expect(selectListItems({ shopping }, 'l1')).toEqual([])
  })

  test('takes the emoji and colour of that list with it', () => {
    const withPrefs = preferencesReducer(
      preferencesReducer(undefined, { type: '@@INIT' }),
      listPreferencesSet({
        listId: 'l1',
        preferences: { color: 'green', emoji: '🛒' },
      }),
    )

    const preferences = preferencesReducer(
      withPrefs,
      listDropped({ listId: 'l1' }),
    )

    expect(selectAllListPreferences({ preferences })['l1']).toBeUndefined()
  })
})
