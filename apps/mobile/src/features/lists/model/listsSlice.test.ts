import { describe, expect, it } from 'vitest'
import {
  listCreated,
  listDeleted,
  listPreferencesLoaded,
  listPreferencesSet,
  listUpdated,
  listsLoaded,
  listsReducer,
  selectAllListPreferences,
  selectAllLists,
  selectListById,
  selectListCount,
  selectListPreferences,
  type ListPreferences,
  type ShoppingList,
} from './listsSlice'

// Behavior-level tests: actions go in through the public action creators,
// results are observed only through the public selectors. No reaching into
// the state shape, no mocks — the reducer/selector pair is the interface.

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
  memberIds: ['mama', 'papa'],
}

const drugstore: ShoppingList = {
  id: 'drugstore',
  name: 'Drogerie',
  memberIds: ['papa'],
}

const greenCart: ListPreferences = { color: 'green', emoji: '🛒' }
const blueApple: ListPreferences = { color: 'blue', emoji: '🍏' }

describe('listsSlice — Listen verwalten', () => {
  it('startet ohne Listen', () => {
    const state = rootStateAfter()

    expect(selectAllLists(state)).toEqual([])
    expect(selectListCount(state)).toBe(0)
    expect(selectListById(state, 'groceries')).toBeNull()
  })

  it('listCreated macht die neue Liste sichtbar', () => {
    const state = rootStateAfter(listCreated(groceries))

    expect(selectListCount(state)).toBe(1)
    expect(selectListById(state, 'groceries')).toEqual(groceries)
  })

  it('listCreated lässt bestehende Listen unberührt', () => {
    const state = rootStateAfter(listCreated(groceries), listCreated(drugstore))

    expect(selectListCount(state)).toBe(2)
    expect(selectListById(state, 'groceries')).toEqual(groceries)
    expect(selectListById(state, 'drugstore')).toEqual(drugstore)
  })

  it('listUpdated ändert Name und Mitglieder der Ziel-Liste', () => {
    const state = rootStateAfter(
      listCreated(groceries),
      listCreated(drugstore),
      listUpdated({
        listId: 'groceries',
        name: 'Großeinkauf',
        memberIds: ['mama', 'papa', 'lena'],
      }),
    )

    expect(selectListById(state, 'groceries')).toEqual({
      id: 'groceries',
      name: 'Großeinkauf',
      memberIds: ['mama', 'papa', 'lena'],
    })
    expect(selectListById(state, 'drugstore')).toEqual(drugstore)
  })

  it('listUpdated auf eine unbekannte Liste ändert nichts', () => {
    const state = rootStateAfter(
      listCreated(groceries),
      listUpdated({ listId: 'unknown', name: 'Egal', memberIds: [] }),
    )

    expect(selectAllLists(state)).toEqual([groceries])
  })

  it('listDeleted entfernt genau die Ziel-Liste', () => {
    const state = rootStateAfter(
      listCreated(groceries),
      listCreated(drugstore),
      listDeleted({ listId: 'groceries' }),
    )

    expect(selectListById(state, 'groceries')).toBeNull()
    expect(selectAllLists(state)).toEqual([drugstore])
  })

  it('listDeleted auf eine unbekannte Liste ändert nichts', () => {
    const state = rootStateAfter(
      listCreated(groceries),
      listDeleted({ listId: 'unknown' }),
    )

    expect(selectAllLists(state)).toEqual([groceries])
  })

  it('listsLoaded ersetzt den Listenbestand', () => {
    const state = rootStateAfter(
      listCreated(groceries),
      listsLoaded({ lists: [drugstore] }),
    )

    expect(selectAllLists(state)).toEqual([drugstore])
  })
})

describe('listsSlice — Listen-Präferenzen', () => {
  it('liefert null für Listen ohne gesetzte Präferenz', () => {
    const state = rootStateAfter(listCreated(groceries))

    expect(selectListPreferences(state, 'groceries')).toBeNull()
  })

  it('listPreferencesSet macht die Präferenz der Ziel-Liste abrufbar', () => {
    const state = rootStateAfter(
      listPreferencesSet({ listId: 'groceries', preferences: greenCart }),
    )

    expect(selectListPreferences(state, 'groceries')).toEqual(greenCart)
    expect(selectListPreferences(state, 'drugstore')).toBeNull()
  })

  it('listPreferencesSet überschreibt nur die Ziel-Liste', () => {
    const state = rootStateAfter(
      listPreferencesSet({ listId: 'groceries', preferences: greenCart }),
      listPreferencesSet({ listId: 'drugstore', preferences: blueApple }),
      listPreferencesSet({ listId: 'groceries', preferences: blueApple }),
    )

    expect(selectListPreferences(state, 'groceries')).toEqual(blueApple)
    expect(selectListPreferences(state, 'drugstore')).toEqual(blueApple)
  })

  it('listPreferencesLoaded ersetzt alle Präferenzen', () => {
    const state = rootStateAfter(
      listPreferencesSet({ listId: 'groceries', preferences: greenCart }),
      listPreferencesLoaded({ drugstore: blueApple }),
    )

    expect(selectListPreferences(state, 'groceries')).toBeNull()
    expect(selectAllListPreferences(state)).toEqual({ drugstore: blueApple })
  })

  it('listDeleted entfernt auch die Präferenzen der Liste', () => {
    const state = rootStateAfter(
      listCreated(groceries),
      listPreferencesSet({ listId: 'groceries', preferences: greenCart }),
      listPreferencesSet({ listId: 'drugstore', preferences: blueApple }),
      listDeleted({ listId: 'groceries' }),
    )

    expect(selectListPreferences(state, 'groceries')).toBeNull()
    expect(selectListPreferences(state, 'drugstore')).toEqual(blueApple)
  })
})

describe('listsSlice — Reducer-Kontrakt', () => {
  it('unbekannte Actions lassen den State referenzgleich', () => {
    // Referential stability is observable behavior in Redux:
    // it is what prevents unnecessary re-renders.
    const before = rootStateAfter(listCreated(groceries)).lists
    const after = listsReducer(before, { type: 'somewhere/else' })

    expect(after).toBe(before)
  })

  it('dieselbe Event-Folge ergibt denselben State (replay-pur)', () => {
    const eventSequence = [
      listCreated(groceries),
      listCreated(drugstore),
      listUpdated({ listId: 'groceries', name: 'Großeinkauf', memberIds: ['mama'] }),
      listPreferencesSet({ listId: 'drugstore', preferences: blueApple }),
      listDeleted({ listId: 'drugstore' }),
    ]

    expect(rootStateAfter(...eventSequence)).toEqual(rootStateAfter(...eventSequence))
  })
})
