// Pins the real slices' send routes so a dropped `on`/`opens` declaration cannot pass silently.

import { describe, expect, it } from 'vitest'
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'
import { listCreated } from '@/features/lists/domain/listsSlice'
import { itemAdded } from '@/features/shopping/domain/shoppingSlice'
import {
  recipeCreated,
  recipeUpdated,
} from '@/features/recipes/domain/recipesSlice'

const meta = { eventId: 'e1', deviceId: 'device-1' }

describe('appSyncPolicy', () => {
  it('routes a shopping event to the log of its list', () => {
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

    expect(appSyncPolicy.toOutboxEntry(action)).toEqual({
      path: '/lists/list-1/events',
      wire: action,
    })
  })

  it('routes listCreated to the lists collection with createdBy on the wire', () => {
    const action = {
      ...listCreated({ listId: 'l1', name: 'REWE', ownerId: 'user-1' }),
      meta,
    }

    expect(appSyncPolicy.toOutboxEntry(action)).toEqual({
      path: '/lists',
      wire: {
        type: 'lists/listCreated',
        payload: { listId: 'l1', name: 'REWE', createdBy: 'user-1' },
        meta,
      },
    })
  })

  it('routes recipeCreated to the recipes collection with createdBy on the wire', () => {
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

    expect(appSyncPolicy.toOutboxEntry(action)).toEqual({
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

  it('routes a recipe event to the log of its recipe', () => {
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

    expect(appSyncPolicy.toOutboxEntry(action)).toEqual({
      path: '/recipes/bolo/events',
      wire: action,
    })
  })

  it('renames createdBy back to ownerId when folding recipeCreated from the server', () => {
    expect(
      appSyncPolicy.domainPayloadOf('recipes/recipeCreated', {
        recipeId: 'bolo',
        name: 'Bolognese',
        createdBy: 'u2',
        portions: 4,
        ingredients: [],
        steps: [],
      }),
    ).toEqual({
      recipeId: 'bolo',
      name: 'Bolognese',
      ownerId: 'u2',
      portions: 4,
      ingredients: [],
      steps: [],
    })
  })

  it('keeps hydrations and server echoes off the wire', () => {
    expect(
      appSyncPolicy.toOutboxEntry({
        type: 'lists/listsLoaded',
        payload: { lists: [] },
        meta,
      }),
    ).toBeNull()
    expect(
      appSyncPolicy.toOutboxEntry({
        type: 'shopping/itemAdded',
        payload: { listId: 'l1' },
        meta: { ...meta, remote: true },
      }),
    ).toBeNull()
  })
})
