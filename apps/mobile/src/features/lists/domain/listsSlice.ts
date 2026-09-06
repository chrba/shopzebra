import { createSlice, type PayloadAction } from '../../../app/createSlice'
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

function withMember(
  state: ListsState,
  listId: string,
  memberId: string,
  name: string,
): ListsState {
  return {
    ...state,
    lists: state.lists.map((list) =>
      list.id === listId
        ? {
            ...list,
            memberIds: list.memberIds.includes(memberId)
              ? list.memberIds
              : [...list.memberIds, memberId],
            memberNames: { ...list.memberNames, [memberId]: name },
          }
        : list,
    ),
  }
}

function withoutMember(
  state: ListsState,
  listId: string,
  memberId: string,
): ListsState {
  return {
    ...state,
    lists: state.lists.map((list) => {
      if (list.id !== listId) return list
      const { [memberId]: _removed, ...remainingNames } = list.memberNames ?? {}
      return {
        ...list,
        memberIds: list.memberIds.filter((id) => id !== memberId),
        memberNames: remainingNames,
      }
    }),
  }
}

const listsSlice = createSlice({
  name: 'lists',
  synced: true,
  initialState,
  reducers: {
    // Local hydration from clientStorage — not a domain event.
    listsLoaded: {
      role: 'hydration',
      reducer: (
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
    },

    // Opens the list's log: no membership exists yet, so it goes to the
    // collection endpoint, where the server bootstraps ownership for the
    // caller and appends this very event (services/events.md).
    listCreated: {
      role: 'event',
      opens: 'list',
      reducer: (
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
    },

    listRenamed: {
      role: 'event',
      on: 'list',
      reducer: (
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
    },

    /**
     * Local-only: this device no longer holds the list — I left it, its
     * owner removed me, or it was deleted while I was away. The server's
     * own event about that never reaches me: whatever ended my membership
     * also ended my access to the log.
     *
     * `releases` is what makes it last. Folding this into `confirmed` is
     * not enough: `confirmed` is the fold of the log, and the log knows
     * nothing of my leaving, so the next pull would fold `listCreated` a
     * second time and the list would be back.
     */
    listDropped: {
      role: 'localEvent',
      releases: 'list',
      reducer: (
        state: ListsState,
        action: PayloadAction<{ readonly listId: string }>,
      ): ListsState => ({
        ...state,
        lists: state.lists.filter((list) => list.id !== action.payload.listId),
      }),
    },

    listDeleted: {
      role: 'event',
      on: 'list',
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly listId: string
        }>,
      ): ListsState => ({
        ...state,
        lists: state.lists.filter((list) => list.id !== action.payload.listId),
      }),
    },

    // Class-2 event: written by the server when someone redeems an invite
    // token. Never dispatched locally, so it only ever arrives through the
    // cursor catch-up with meta.remote.
    listMemberAdded: {
      role: 'event',
      on: 'list',
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly listId: string
          readonly memberId: string
          readonly name: string
        }>,
      ): ListsState =>
        withMember(
          state,
          action.payload.listId,
          action.payload.memberId,
          action.payload.name,
        ),
    },

    // Class-2 event, counterpart of listMemberAdded.
    listMemberRemoved: {
      role: 'event',
      on: 'list',
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly listId: string
          readonly memberId: string
        }>,
      ): ListsState =>
        withoutMember(state, action.payload.listId, action.payload.memberId),
    },

    // Local-only: the friend was tapped, the command is still travelling.
    // The row must appear now; if the server refuses, listMemberRemovedLocally
    // takes it back off. The real listMemberAdded arrives with the next pull.
    listMemberAddedLocally: {
      role: 'localEvent',
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly listId: string
          readonly memberId: string
          readonly name: string
        }>,
      ): ListsState =>
        withMember(
          state,
          action.payload.listId,
          action.payload.memberId,
          action.payload.name,
        ),
    },

    // Local-only: the server already wrote listMemberRemoved (or refused an
    // add). Folding this now makes the row disappear one pull earlier; the
    // real event folds on top later and the reducer, being total, absorbs it.
    listMemberRemovedLocally: {
      role: 'localEvent',
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly listId: string
          readonly memberId: string
        }>,
      ): ListsState =>
        withoutMember(state, action.payload.listId, action.payload.memberId),
    },

    // Observation: comes from GET /lists, not from a user action.
    memberLimitLoaded: {
      role: 'observation',
      reducer: (
        state: ListsState,
        action: PayloadAction<{ readonly maxMembers: number }>,
      ): ListsState => ({
        ...state,
        maxMembers: action.payload.maxMembers,
      }),
    },

    // Observation: comes from GET /lists, not from a user action. The
    // owner's name has no event to travel in — listCreated holds the list's
    // name, not the creator's.
    ownerNamesLoaded: {
      role: 'observation',
      reducer: (
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
  },
})

// --- Actions ---

export const {
  listsLoaded,
  listCreated,
  listDropped,
  listRenamed,
  listDeleted,
  listMemberAdded,
  listMemberRemoved,
  listMemberAddedLocally,
  listMemberRemovedLocally,
  ownerNamesLoaded,
  memberLimitLoaded,
} = listsSlice.actions
export const listsReducer = listsSlice.reducer
export const listsSyncDeclarations = listsSlice.declarations

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
