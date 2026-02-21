import { createSlice, type PayloadAction } from '../../app/createSlice'

// --- Types ---

export type ListColor = 'green' | 'blue' | 'red' | 'purple' | 'yellow'

export type Member = {
  readonly letter: string
  readonly color: string
}

export type Activity = {
  readonly who: string
  readonly what: string
  readonly when: string
}

export type ShoppingList = {
  readonly id: string
  readonly name: string
  readonly emoji: string
  readonly color: ListColor
  readonly itemCount: number
  readonly members: readonly Member[]
  readonly activity: Activity | null
  readonly badge: string | null
}

type ListsState = {
  readonly lists: readonly ShoppingList[]
}

// --- Slice ---

const initialState: ListsState = {
  lists: [],
}

const listsSlice = createSlice({
  name: 'lists',
  initialState,
  reducers: {
    listsLoaded: (
      state: ListsState,
      action: PayloadAction<{ readonly lists: readonly ShoppingList[] }>,
    ) => ({
      ...state,
      lists: action.payload.lists,
    }),

    listCreated: {
      prepare: (
        name: string,
        emoji: string,
        color: ListColor,
        members: readonly Member[],
      ) => ({
        payload: {
          id: crypto.randomUUID(),
          name,
          emoji,
          color,
          members,
        },
      }),
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly id: string
          readonly name: string
          readonly emoji: string
          readonly color: ListColor
          readonly members: readonly Member[]
        }>,
      ) => ({
        ...state,
        lists: [
          ...state.lists,
          {
            id: action.payload.id,
            name: action.payload.name,
            emoji: action.payload.emoji,
            color: action.payload.color,
            itemCount: 0,
            members: action.payload.members,
            activity: { who: 'Du', what: 'erstellt', when: 'gerade' },
            badge: null,
          },
        ],
      }),
    },

    listDeleted: (
      state: ListsState,
      action: PayloadAction<{ readonly listId: string }>,
    ) => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== action.payload.listId),
    }),
  },
})

// --- Actions ---

export const { listsLoaded, listCreated, listDeleted } = listsSlice.actions
export const listsReducer = listsSlice.reducer

// --- Selectors ---

export const selectAllLists = (state: { readonly lists: ListsState }) =>
  state.lists.lists
export const selectListCount = (state: { readonly lists: ListsState }) =>
  state.lists.lists.length
export const selectTotalItemCount = (state: { readonly lists: ListsState }) =>
  state.lists.lists.reduce((sum, list) => sum + list.itemCount, 0)

export const selectListById = (
  state: { readonly lists: ListsState },
  listId: string,
) => state.lists.lists.find((list) => list.id === listId) ?? null
