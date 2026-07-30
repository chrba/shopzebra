import { describe, expect, it } from 'vitest'
import {
  listPreferencesLoaded,
  listPreferencesSet,
  preferencesReducer,
  selectAllListPreferences,
  selectListPreferences,
} from '@/features/preferences/domain/preferencesSlice'
import { listDeleted } from '@/features/lists/domain/listsSlice'
import type { ListPreferences } from '@/features/preferences/domain/preferencesDomain'

// Behavior-level tests through public actions and selectors — no mocks.

type PreferencesRootState = Parameters<typeof selectAllListPreferences>[0]

const initialization = { type: '@@INIT' }

function rootStateAfter(
  ...actions: readonly { readonly type: string }[]
): PreferencesRootState {
  const sliceState = actions.reduce(
    (state, action) => preferencesReducer(state, action),
    preferencesReducer(undefined, initialization),
  )
  return { preferences: sliceState }
}

const greenCart: ListPreferences = { color: 'green', emoji: '🛒' }
const blueApple: ListPreferences = { color: 'blue', emoji: '🍏' }

describe('preferencesSlice — Listen-Präferenzen', () => {
  it('liefert null für Listen ohne gesetzte Präferenz', () => {
    const state = rootStateAfter()

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

  it('reagiert auf listDeleted aus der lists-Domain und räumt auf', () => {
    const state = rootStateAfter(
      listPreferencesSet({ listId: 'groceries', preferences: greenCart }),
      listPreferencesSet({ listId: 'drugstore', preferences: blueApple }),
      listDeleted({ listId: 'groceries' }),
    )

    expect(selectListPreferences(state, 'groceries')).toBeNull()
    expect(selectListPreferences(state, 'drugstore')).toEqual(blueApple)
  })
})
