import { createSlice, type PayloadAction } from '../../../app/createSlice'
import { identityAttached } from '../../auth/domain/authSlice'
import { withRewrittenMembership } from '../../sharing/rewrittenMembership'
import type { ShoppingList } from './listsDomain'

type ListsState = {
  readonly lists: readonly ShoppingList[]
  /**
   * Member cap per list, delivered by GET /lists (maxMembers). Null until
   * the first projection arrives — the server enforces the cap either way,
   * this value only drives the "Liste ist voll" UI. Lives here and not in a
   * constant so the client never holds its own copy of the number.
   */
  readonly maxMembers: number | null
}

// --- Slice ---
//
// Action payloads follow the wire format in services/events.md:
// the same object is Redux action, domain event and wire format.
// Intention events only — no full-state updates (rebase would clobber).

const initialState: ListsState = {
  lists: [],
  maxMembers: null,
}

const listsSlice = createSlice({
  name: 'lists',
  synced: true,
  initialState,
  reducers: {
    // Local hydration from clientStorage — not a domain event.
    listsLoaded: (
      state: ListsState,
      action: PayloadAction<{
        readonly lists: readonly ShoppingList[]
      }>,
    ): ListsState => ({
      ...state,
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

    /**
     * Local-only: I left this list. The server wrote the member-removed
     * event, but it will never reach me — leaving ends my access to that
     * log. The payload names the id `id` and not `listId` on purpose: a
     * `listId` at the root would put this into the outbox, where it would
     * be posted to a list I am no longer a member of.
     */
    listLeft: (
      state: ListsState,
      action: PayloadAction<{ readonly id: string }>,
    ): ListsState => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== action.payload.id),
    }),

    /**
     * Local-only: leaving failed, so the list comes back. The counterpart
     * of listLeft, which is dispatched before the server has answered so
     * the tile disappears on the tap. Names the payload `list` and not
     * `listId` for the same reason listLeft does: a listId at the root
     * would put this into the outbox, and there is nothing to send.
     *
     * Total, like every fold: a list that is already there stays as it is.
     */
    listRestored: (
      state: ListsState,
      action: PayloadAction<{ readonly list: ShoppingList }>,
    ): ListsState =>
      state.lists.some((list) => list.id === action.payload.list.id)
        ? state
        : { ...state, lists: [...state.lists, action.payload.list] },

    listDeleted: (
      state: ListsState,
      action: PayloadAction<{
        readonly listId: string
      }>,
    ): ListsState => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== action.payload.listId),
    }),

    // Class-2 event: written by the server when someone redeems an invite
    // token. Never dispatched locally, so it only ever arrives through the
    // cursor catch-up with meta.remote.
    listMemberAdded: (
      state: ListsState,
      action: PayloadAction<{
        readonly listId: string
        readonly memberId: string
        readonly name: string
      }>,
    ): ListsState => ({
      ...state,
      lists: state.lists.map((list) =>
        list.id === action.payload.listId
          ? {
              ...list,
              memberIds: list.memberIds.includes(action.payload.memberId)
                ? list.memberIds
                : [...list.memberIds, action.payload.memberId],
              memberNames: {
                ...list.memberNames,
                [action.payload.memberId]: action.payload.name,
              },
            }
          : list,
      ),
    }),

    // Class-2 event, counterpart of listMemberAdded.
    listMemberRemoved: (
      state: ListsState,
      action: PayloadAction<{
        readonly listId: string
        readonly memberId: string
      }>,
    ): ListsState => ({
      ...state,
      lists: state.lists.map((list) => {
        if (list.id !== action.payload.listId) return list
        const { [action.payload.memberId]: _removed, ...remainingNames } =
          list.memberNames ?? {}
        return {
          ...list,
          memberIds: list.memberIds.filter(
            (memberId) => memberId !== action.payload.memberId,
          ),
          memberNames: remainingNames,
        }
      }),
    }),

    // Local-only: the member cap from GET /lists. No listId at the payload
    // root, so needsSync() keeps it out of the outbox.
    memberLimitLoaded: (
      state: ListsState,
      action: PayloadAction<{ readonly maxMembers: number }>,
    ): ListsState => ({
      ...state,
      maxMembers: action.payload.maxMembers,
    }),

    // Local-only: owner names from GET /lists. Carries no listId at the
    // payload root, so needsSync() keeps it out of the outbox. The owner's
    // name has no event to travel in — listCreated holds the list's name,
    // not the creator's.
    ownerNamesLoaded: (
      state: ListsState,
      action: PayloadAction<{
        readonly ownerNames: Readonly<Record<string, string>>
      }>,
    ): ListsState => ({
      ...state,
      lists: state.lists.map((list) => {
        const ownerName = action.payload.ownerNames[list.id]
        if (ownerName === undefined) return list
        return {
          ...list,
          memberNames: { ...list.memberNames, [list.ownerId]: ownerName },
        }
      }),
    }),
  },
  extraReducers: [
    {
      creator: identityAttached,
      // What this device owned under the local sentinel belongs to the
      // freshly created account now. Foreign ids stay untouched.
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly previousUserId: string
          readonly userId: string
        }>,
      ): ListsState => ({
        ...state,
        lists: state.lists.map((list) => ({
          ...list,
          ...withRewrittenMembership(
            list,
            action.payload.previousUserId,
            action.payload.userId,
          ),
        })),
      }),
    },
  ],
})

// --- Actions ---

export const {
  listsLoaded,
  listCreated,
  listLeft,
  listRestored,
  listRenamed,
  listDeleted,
  listMemberAdded,
  listMemberRemoved,
  ownerNamesLoaded,
  memberLimitLoaded,
} = listsSlice.actions
export const listsReducer = listsSlice.reducer

// --- Selectors ---

type StateWithLists = { readonly lists: ListsState }

export const selectAllLists = (state: StateWithLists) => state.lists.lists

export const selectListCount = (state: StateWithLists) =>
  state.lists.lists.length

export const selectListById = (state: StateWithLists, listId: string) =>
  state.lists.lists.find((list) => list.id === listId) ?? null

export const selectMaxMembers = (state: StateWithLists) =>
  state.lists.maxMembers

/** True once the cap is known AND reached — unknown cap never blocks the UI. */
export const selectListIsFull = (state: StateWithLists, listId: string) => {
  const list = state.lists.lists.find((candidate) => candidate.id === listId)
  const cap = state.lists.maxMembers
  return list !== undefined && cap !== null && list.memberIds.length >= cap
}

/**
 * Members of a list in join order, owner first. `name` is null when nobody
 * ever supplied one — the view decides what to show instead, so no
 * placeholder text leaks into the domain.
 */
export const selectListMembers = (
  state: StateWithLists,
  listId: string,
): readonly {
  readonly id: string
  readonly name: string | null
  readonly isOwner: boolean
}[] => {
  const list = state.lists.lists.find((candidate) => candidate.id === listId)
  if (!list) return []
  return list.memberIds.map((memberId) => ({
    id: memberId,
    name: list.memberNames?.[memberId] ?? null,
    isOwner: memberId === list.ownerId,
  }))
}
