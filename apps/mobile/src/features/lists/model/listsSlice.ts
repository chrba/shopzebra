import { createSlice, type PayloadAction } from '../../../app/createSlice'

// --- Domain Types ---

/**
 * A shopping list shared among family members.
 * Synced to the backend — contains only domain data,
 * no UI preferences.
 */
export type ShoppingList = {
  readonly id: string
  readonly name: string
  readonly memberIds: readonly string[]
}

/**
 * Available color themes for list icons and backgrounds.
 * Purely cosmetic, stored in local preferences.
 */
export type ListColor = 'green' | 'blue' | 'red' | 'purple' | 'yellow'

/**
 * Local display preferences for a shopping list.
 * Stored per-device, not synced to the backend.
 */
export type ListPreferences = {
  readonly color: ListColor
  readonly emoji: string
}

type ListsState = {
  readonly lists: readonly ShoppingList[]
  readonly preferences: { readonly [listId: string]: ListPreferences }
}

// --- Slice ---

const initialState: ListsState = {
  lists: [],
  preferences: {},
}

const listsSlice = createSlice({
  name: 'lists',
  initialState,
  reducers: {
    listsLoaded: (state: ListsState, action: PayloadAction<{
      readonly lists: readonly ShoppingList[]
    }>) => ({
      ...state,
      lists: action.payload.lists,
    }),

    listCreated: (state: ListsState, action: PayloadAction<{
      readonly id: string
      readonly name: string
      readonly memberIds: readonly string[]
    }>) => ({
      ...state,
      lists: [
        ...state.lists,
        {
          id: action.payload.id,
          name: action.payload.name,
          memberIds: action.payload.memberIds,
        },
      ],
    }),

    listUpdated: (state: ListsState, action: PayloadAction<{
      readonly listId: string
      readonly name: string
      readonly memberIds: readonly string[]
    }>) => ({
      ...state,
      lists: state.lists.map((list) =>
        list.id === action.payload.listId
          ? {
              ...list,
              name: action.payload.name,
              memberIds: action.payload.memberIds,
            }
          : list,
      ),
    }),

    listDeleted: (state: ListsState, action: PayloadAction<{
      readonly listId: string
    }>) => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== action.payload.listId),
      preferences: Object.fromEntries(
        Object.entries(state.preferences).filter(([id]) => id !== action.payload.listId),
      ),
    }),

    listPreferencesLoaded: (state: ListsState, action: PayloadAction<{
      readonly [listId: string]: ListPreferences
    }>) => ({
      ...state,
      preferences: action.payload,
    }),

    listPreferencesSet: (state: ListsState, action: PayloadAction<{
      readonly listId: string
      readonly preferences: ListPreferences
    }>) => ({
      ...state,
      preferences: {
        ...state.preferences,
        [action.payload.listId]: action.payload.preferences,
      },
    }),
  },
})

// --- Actions ---

export const {
  listsLoaded,
  listCreated,
  listUpdated,
  listDeleted,
  listPreferencesLoaded,
  listPreferencesSet,
} = listsSlice.actions
export const listsReducer = listsSlice.reducer

// --- Family Members (hardcoded until familySlice exists) ---

export const FAMILY_MEMBERS: Readonly<
  Record<string, { readonly name: string; readonly color: string }>
> = {
  mama: { name: 'Mama', color: '#6BBF6B' },
  papa: { name: 'Papa', color: '#5BA8D5' },
  lena: { name: 'Lena', color: '#E07B7B' },
  opa: { name: 'Opa', color: '#A07BCC' },
}

// --- Selectors ---

export const selectAllLists = (state: { readonly lists: ListsState }) =>
  state.lists.lists
export const selectListCount = (state: { readonly lists: ListsState }) =>
  state.lists.lists.length

export const selectListById = (
  state: { readonly lists: ListsState },
  listId: string,
) => state.lists.lists.find((list) => list.id === listId) ?? null

export const selectAllListPreferences = (state: { readonly lists: ListsState }) =>
  state.lists.preferences

export const selectListPreferences = (
  state: { readonly lists: ListsState },
  listId: string,
) => state.lists.preferences[listId] ?? null
