import { describe, expect, it } from 'vitest'
import {
  listCreated,
  listsLoaded,
  listsReducer,
  selectAllLists,
} from './listsSlice'
import type { ShoppingList } from './listsDomain'

// Behavior-level tests: actions go in through the public action creators,
// results are observed only through the public selectors. No reaching into
// the state shape, no mocks — the reducer/selector pair is the interface.
//
// These tests cover reducer totality (architecture/sync-engine.md §5): an
// event that is not applicable to the current state must be ignored, never
// applied destructively. Regression coverage for the duplicate-list bug
// found during sync-engine cursor-catch-up verification.

type ListsRootState = Parameters<typeof selectAllLists>[0]

const initialization = { type: '@@INIT' }

function rootStateAfter(
  ...actions: readonly { readonly type: string }[]
): ListsRootState {
  const sliceState = actions.reduce(
    (state, action) => listsReducer(state, action),
    listsReducer(undefined, initialization),
  )
  return { lists: sliceState }
}

const groceries: ShoppingList = {
  id: 'groceries',
  name: 'Wocheneinkauf',
  ownerId: 'mama',
  memberIds: ['mama'],
}

const groceriesRenamedDuplicate: ShoppingList = {
  id: 'groceries',
  name: 'Renamed duplicate',
  ownerId: 'papa',
  memberIds: ['papa'],
}

const drugstore: ShoppingList = {
  id: 'drugstore',
  name: 'Drogerie',
  ownerId: 'papa',
  memberIds: ['papa'],
}

describe('listsSlice — reducer totality', () => {
  it('folding the same listCreated twice yields exactly one list', () => {
    const createGroceries = listCreated({
      listId: 'groceries',
      name: 'Wocheneinkauf',
      ownerId: 'mama',
    })

    const state = rootStateAfter(createGroceries, createGroceries)

    expect(selectAllLists(state)).toEqual([groceries])
  })

  it('listsLoaded with a duplicated id yields exactly one list (first wins)', () => {
    const state = rootStateAfter(
      listsLoaded({ lists: [groceries, groceriesRenamedDuplicate, drugstore] }),
    )

    expect(selectAllLists(state)).toEqual([groceries, drugstore])
  })

  it('a normal second listCreated with a different id still appends', () => {
    const state = rootStateAfter(
      listCreated({
        listId: 'groceries',
        name: 'Wocheneinkauf',
        ownerId: 'mama',
      }),
      listCreated({ listId: 'drugstore', name: 'Drogerie', ownerId: 'papa' }),
    )

    expect(selectAllLists(state)).toEqual([groceries, drugstore])
  })
})
