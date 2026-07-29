import { createSlice, type PayloadAction } from '../../../app/createSlice'
import type { ShoppingList } from './listsDomain'

type ListsState = {
  readonly lists: readonly ShoppingList[]
}

// --- Slice ---
//
// Action payloads follow the wire format in services/events.md:
// the same object is Redux action, domain event and wire format.
// Intention events only — no full-state updates (rebase would clobber).

const initialState: ListsState = {
  lists: [],
}

const listsSlice = createSlice({
  name: 'lists',
  synced: true,
  initialState,
  reducers: {
    // Local hydration from clientStorage — not a domain event.
    listsLoaded: (
      _state: ListsState,
      action: PayloadAction<{
        readonly lists: readonly ShoppingList[]
      }>,
    ): ListsState => ({
      // Dedup by id, first occurrence wins. This heals already-persisted
      // state that was damaged by a non-total fold before listCreated
      // guarded against re-applying an event for a list it already knows.
      lists: action.payload.lists.filter(
        (list, index) =>
          action.payload.lists.findIndex((other) => other.id === list.id) ===
          index,
      ),
    }),

    listCreated: (
      state: ListsState,
      action: PayloadAction<{
        readonly listId: string
        readonly name: string
        readonly ownerId: string
      }>,
    ): ListsState => {
      // Reducer totality (architecture/sync-engine.md §5): an event that is
      // not applicable to the current state is ignored, never applied
      // destructively. On cursor catch-up the same listCreated can be
      // folded onto state that already contains the list (e.g. fresh
      // applied-set after an upgrade) — appending blindly would duplicate it.
      if (state.lists.some((list) => list.id === action.payload.listId)) {
        return state
      }

      return {
        ...state,
        lists: [
          ...state.lists,
          {
            id: action.payload.listId,
            name: action.payload.name,
            ownerId: action.payload.ownerId,
            memberIds: [action.payload.ownerId],
          },
        ],
      }
    },

    listRenamed: (
      state: ListsState,
      action: PayloadAction<{
        readonly listId: string
        readonly name: string
      }>,
    ): ListsState => ({
      ...state,
      lists: state.lists.map((list) =>
        list.id === action.payload.listId
          ? { ...list, name: action.payload.name }
          : list,
      ),
    }),

    listDeleted: (
      state: ListsState,
      action: PayloadAction<{
        readonly listId: string
      }>,
    ): ListsState => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== action.payload.listId),
    }),
  },
})

// --- Actions ---

export const { listsLoaded, listCreated, listRenamed, listDeleted } =
  listsSlice.actions
export const listsReducer = listsSlice.reducer

// --- Selectors ---

type StateWithLists = { readonly lists: ListsState }

export const selectAllLists = (state: StateWithLists) => state.lists.lists

export const selectListCount = (state: StateWithLists) =>
  state.lists.lists.length

export const selectListById = (state: StateWithLists, listId: string) =>
  state.lists.lists.find((list) => list.id === listId) ?? null
