import { describe, expect, it, vi } from 'vitest'
import { createSlice } from '@/app/createSlice'
import { toOutboxEntry } from '@/app/sync/send/toOutboxEntry'
import { itemAdded } from '@/features/shopping/domain/shoppingSlice'
import { listCreated } from '@/features/lists/domain/listsSlice'
import {
  recipeCreated,
  recipeUpdated,
} from '@/features/recipes/domain/recipesSlice'

const meta = { eventId: 'e1', deviceId: 'device-1' }

// A slice of its own, so the test states the mismatch rather than leaning on
// whatever payload shapes the feature slices happen to carry today.
const demo = createSlice({
  name: 'toOutboxEntryDemo',
  initialState: {},
  synced: true,
  reducers: {
    anEventWithoutAggregateId: {
      role: 'event',
      reducer: (state: object) => state,
    },
  },
})

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

  it('maps recipeCreated to the recipe command endpoint with createdBy', () => {
    const action = {
      ...recipeCreated({
        recipeId: 'bolo',
        name: 'Bolognese',
        ownerId: 'user-1',
        portions: 4,
        ingredients: [],
        steps: [],
      }),
      meta,
    }

    const entry = toOutboxEntry(action)

    expect(entry).toEqual({
      path: '/recipes',
      wire: {
        type: 'recipes/recipeCreated',
        payload: {
          recipeId: 'bolo',
          name: 'Bolognese',
          createdBy: 'user-1',
          portions: 4,
          ingredients: [],
          steps: [],
        },
        meta,
      },
    })
  })

  it('maps a later recipe edit to the recipe log, not the list log', () => {
    const action = {
      ...recipeUpdated({
        recipeId: 'bolo',
        name: 'Bolognese XL',
        portions: 8,
        ingredients: [],
        steps: [],
      }),
      meta,
    }

    const entry = toOutboxEntry(action)

    expect(entry).toEqual({ path: '/recipes/bolo/events', wire: action })
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

  it('logs and returns null when a role admits an action but its payload carries no aggregate id', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const action = {
      type: demo.actions.anEventWithoutAggregateId.type,
      payload: { note: 'no id field here' },
      meta,
    }

    const entry = toOutboxEntry(action)

    expect(entry).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(demo.actions.anEventWithoutAggregateId.type),
    )
    errorSpy.mockRestore()
  })
})
