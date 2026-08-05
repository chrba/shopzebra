import { beforeEach, describe, expect, test, vi } from 'vitest'

const written = vi.hoisted(() => new Map<string, string>())

vi.mock('@/app/clientStorage', () => ({
  setItem: (key: string, value: string) => {
    written.set(key, value)
    return Promise.resolve()
  },
}))

import { listsClientStorageHandler } from '@/features/lists/domain/listsClientStorageHandler'
import { recipesClientStorageHandler } from '@/features/recipes/domain/recipesClientStorageHandler'
import { ownerNamesLoaded } from '@/features/lists/domain/listsSlice'
import { recipeOwnerNamesLoaded } from '@/features/recipes/domain/recipesSlice'

// The owner's name has no event to travel in — it arrives from the
// collection endpoint. Unless it is written to disk with the rest of the
// tree, every restart shows "Mitglied" until the network answers.
describe('the owner name survives a restart', () => {
  beforeEach(() => written.clear())

  test('a list keeps whose it is', () => {
    const state = () => ({
      sync: {
        confirmed: {
          lists: {
            lists: [
              {
                id: 'l1',
                name: 'Wocheneinkauf',
                ownerId: 'sarah',
                memberIds: ['sarah', 'me'],
                memberNames: { sarah: 'Eiszebra' },
              },
            ],
          },
        },
      },
    })

    listsClientStorageHandler(ownerNamesLoaded({ ownerNames: {} }), state)

    expect(written.get('shopzebra_lists')).toContain('Eiszebra')
  })

  test('a recipe keeps whose it is', () => {
    const state = () => ({
      sync: {
        confirmed: {
          recipes: {
            recipes: [
              {
                id: 'r1',
                name: 'Bolognese',
                ownerId: 'sarah',
                memberIds: ['sarah', 'me'],
                memberNames: { sarah: 'Eiszebra' },
              },
            ],
          },
        },
      },
    })

    recipesClientStorageHandler(
      recipeOwnerNamesLoaded({ ownerNames: {} }),
      state,
    )

    expect(written.get('shopzebra_recipes')).toContain('Eiszebra')
  })
})
