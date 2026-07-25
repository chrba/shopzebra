import { describe, expect, it } from 'vitest'
import {
  listCreated,
  listDeleted,
  listRenamed,
  listsLoaded,
  listsReducer,
  selectAllLists,
  selectListById,
  selectListCount,
} from './listsSlice'
import type { ShoppingList } from './listsDomain'

// Behavior-level tests: actions go in through the public action creators,
// results are observed only through the public selectors. No reaching into
// the state shape, no mocks — the reducer/selector pair is the interface.
//
// Payloads follow the wire format in services/events.md.

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
  memberIds: ['mama', 'papa'],
}

const drugstore: ShoppingList = {
  id: 'drugstore',
  name: 'Drogerie',
  ownerId: 'papa',
  memberIds: ['papa'],
}

describe('listsSlice — Listen verwalten', () => {
  it('startet ohne Listen', () => {
    const state = rootStateAfter()

    expect(selectAllLists(state)).toEqual([])
    expect(selectListCount(state)).toBe(0)
    expect(selectListById(state, 'groceries')).toBeNull()
  })

  it('listCreated legt die Liste an — der Owner ist erstes Mitglied', () => {
    const state = rootStateAfter(
      listCreated({ listId: 'groceries', name: 'Wocheneinkauf', ownerId: 'mama' }),
    )

    expect(selectListCount(state)).toBe(1)
    expect(selectListById(state, 'groceries')).toEqual({
      id: 'groceries',
      name: 'Wocheneinkauf',
      ownerId: 'mama',
      memberIds: ['mama'],
    })
  })

  it('listCreated lässt bestehende Listen unberührt', () => {
    const state = rootStateAfter(
      listCreated({ listId: 'groceries', name: 'Wocheneinkauf', ownerId: 'mama' }),
      listCreated({ listId: 'drugstore', name: 'Drogerie', ownerId: 'papa' }),
    )

    expect(selectListCount(state)).toBe(2)
    expect(selectListById(state, 'groceries')?.name).toBe('Wocheneinkauf')
    expect(selectListById(state, 'drugstore')?.name).toBe('Drogerie')
  })

  it('listRenamed ändert nur den Namen der Ziel-Liste', () => {
    const state = rootStateAfter(
      listsLoaded({ lists: [groceries, drugstore] }),
      listRenamed({ listId: 'groceries', name: 'Großeinkauf' }),
    )

    expect(selectListById(state, 'groceries')).toEqual({
      ...groceries,
      name: 'Großeinkauf',
    })
    expect(selectListById(state, 'drugstore')).toEqual(drugstore)
  })

  it('listRenamed auf eine unbekannte Liste ändert nichts', () => {
    const state = rootStateAfter(
      listsLoaded({ lists: [groceries] }),
      listRenamed({ listId: 'unknown', name: 'Egal' }),
    )

    expect(selectAllLists(state)).toEqual([groceries])
  })

  it('listDeleted entfernt genau die Ziel-Liste', () => {
    const state = rootStateAfter(
      listsLoaded({ lists: [groceries, drugstore] }),
      listDeleted({ listId: 'groceries' }),
    )

    expect(selectListById(state, 'groceries')).toBeNull()
    expect(selectAllLists(state)).toEqual([drugstore])
  })

  it('listDeleted auf eine unbekannte Liste ändert nichts', () => {
    const state = rootStateAfter(
      listsLoaded({ lists: [groceries] }),
      listDeleted({ listId: 'unknown' }),
    )

    expect(selectAllLists(state)).toEqual([groceries])
  })

  it('listsLoaded ersetzt den Listenbestand', () => {
    const state = rootStateAfter(
      listCreated({ listId: 'groceries', name: 'Wocheneinkauf', ownerId: 'mama' }),
      listsLoaded({ lists: [drugstore] }),
    )

    expect(selectAllLists(state)).toEqual([drugstore])
  })
})

describe('listsSlice — Reducer-Kontrakt', () => {
  it('unbekannte Actions lassen den State referenzgleich', () => {
    // Referential stability is observable behavior in Redux:
    // it is what prevents unnecessary re-renders.
    const before = rootStateAfter(
      listCreated({ listId: 'groceries', name: 'Wocheneinkauf', ownerId: 'mama' }),
    ).lists
    const after = listsReducer(before, { type: 'somewhere/else' })

    expect(after).toBe(before)
  })

  it('dieselbe Event-Folge ergibt denselben State (replay-pur)', () => {
    const eventSequence = [
      listCreated({ listId: 'groceries', name: 'Wocheneinkauf', ownerId: 'mama' }),
      listCreated({ listId: 'drugstore', name: 'Drogerie', ownerId: 'papa' }),
      listRenamed({ listId: 'groceries', name: 'Großeinkauf' }),
      listDeleted({ listId: 'drugstore' }),
    ]

    expect(rootStateAfter(...eventSequence)).toEqual(rootStateAfter(...eventSequence))
  })
})
