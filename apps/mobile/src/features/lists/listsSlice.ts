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

export type LoadListsPayload = {
  readonly lists: readonly ShoppingList[]
}

export type CreateListPayload = {
  readonly id: string
  readonly name: string
  readonly emoji: string
  readonly color: ListColor
  readonly members: readonly Member[]
}

export type UpdateListPayload = {
  readonly listId: string
  readonly name: string
  readonly emoji: string
  readonly color: ListColor
  readonly members: readonly Member[]
}

export type DeleteListPayload = {
  readonly listId: string
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
    listsLoaded: (state: ListsState, action: PayloadAction<LoadListsPayload>) => ({
      ...state,
      lists: action.payload.lists,
    }),

    listCreated: (state: ListsState, action: PayloadAction<CreateListPayload>) => ({
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

    listUpdated: (state: ListsState, action: PayloadAction<UpdateListPayload>) => ({
      ...state,
      lists: state.lists.map((list) =>
        list.id === action.payload.listId
          ? {
              ...list,
              name: action.payload.name,
              emoji: action.payload.emoji,
              color: action.payload.color,
              members: action.payload.members,
            }
          : list,
      ),
    }),

    listDeleted: (state: ListsState, action: PayloadAction<DeleteListPayload>) => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== action.payload.listId),
    }),
  },
})

// --- Actions ---

export const { listsLoaded, listCreated, listUpdated, listDeleted } = listsSlice.actions
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

