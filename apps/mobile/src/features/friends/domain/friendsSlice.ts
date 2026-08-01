// The address book: everyone the user can put on a list with one tap.
//
// Friendships live outside the event log (they are user-scoped and never
// conflict), so this slice is NOT synced. It is filled from GET /friends
// and cached locally, so the screen shows the last known state offline.

import { createSlice, type PayloadAction } from '../../../app/createSlice'

export type Friend = {
  readonly id: string
  /** Null when the friend never set a display name — views fall back. */
  readonly name: string | null
}

export type FriendsState = {
  readonly friends: readonly Friend[]
  /** True once the server answered this session; false on cache-only data. */
  readonly loaded: boolean
}

const initialState: FriendsState = {
  friends: [],
  loaded: false,
}

const friendsSlice = createSlice({
  name: 'friends',
  initialState,
  reducers: {
    /** Fresh answer from GET /friends. */
    friendsLoaded: (
      state: FriendsState,
      action: PayloadAction<{ readonly friends: readonly Friend[] }>,
    ): FriendsState => ({
      ...state,
      friends: action.payload.friends,
      loaded: true,
    }),

    /** Hydration from the local cache during startup. */
    friendsRestored: (
      state: FriendsState,
      action: PayloadAction<{ readonly friends: readonly Friend[] }>,
    ): FriendsState => ({
      ...state,
      friends: action.payload.friends,
    }),

    /**
     * Optimistic removal — the DELETE only touches the caller's own side,
     * so there is nothing to reconcile with anybody else.
     */
    friendRemoved: (
      state: FriendsState,
      action: PayloadAction<{ readonly friendId: string }>,
    ): FriendsState => ({
      ...state,
      friends: state.friends.filter(
        (friend) => friend.id !== action.payload.friendId,
      ),
    }),
  },
})

// --- Actions ---

export const { friendsLoaded, friendsRestored, friendRemoved } =
  friendsSlice.actions
export const friendsReducer = friendsSlice.reducer

// --- Selectors ---

type StateWithFriends = { readonly friends: FriendsState }

export const selectFriends = (state: StateWithFriends) => state.friends.friends

export const selectFriendCount = (state: StateWithFriends) =>
  state.friends.friends.length
