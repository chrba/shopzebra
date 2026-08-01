// A join that could not run yet because the caller had no session.
//
// Chosen over threading a ?redirect= parameter through the auth pages:
// that would spread the responsibility across four navigations, teach the
// auth screens about lists, and die whenever the app is killed — which is
// exactly what happens while the invitee leaves for the mail app to fetch
// the confirmation code. Here it is one field, persisted, resolved in one
// place (requireAuth).

import { createSlice, type PayloadAction } from '../../../app/createSlice'

export type JoinIntentState = {
  /** Pending list invite token. */
  readonly token: string | null
  /** Pending friendship invite token — same detour, different redemption. */
  readonly friendToken: string | null
}

const initialState: JoinIntentState = { token: null, friendToken: null }

const joinIntentSlice = createSlice({
  name: 'joinIntent',
  initialState,
  reducers: {
    /** An invite route was hit without a session. */
    joinIntentStored: (
      state: JoinIntentState,
      action: PayloadAction<{ readonly token: string }>,
    ): JoinIntentState => ({ ...state, token: action.payload.token }),

    /** Hydration from clientStorage during startup. */
    joinIntentRestored: (
      state: JoinIntentState,
      action: PayloadAction<{ readonly token: string | null }>,
    ): JoinIntentState => ({ ...state, token: action.payload.token }),

    /**
     * After the join was attempted — on success and on failure alike. A
     * stale intent would otherwise fire again on every later sign-in.
     */
    joinIntentCleared: (state: JoinIntentState): JoinIntentState => ({
      ...state,
      token: null,
    }),

    /** A friendship invite was hit without a session. */
    friendIntentStored: (
      state: JoinIntentState,
      action: PayloadAction<{ readonly token: string }>,
    ): JoinIntentState => ({ ...state, friendToken: action.payload.token }),

    /** Hydration from clientStorage during startup. */
    friendIntentRestored: (
      state: JoinIntentState,
      action: PayloadAction<{ readonly token: string | null }>,
    ): JoinIntentState => ({ ...state, friendToken: action.payload.token }),

    /** After the friendship invite was answered, either way. */
    friendIntentCleared: (state: JoinIntentState): JoinIntentState => ({
      ...state,
      friendToken: null,
    }),
  },
})

// --- Actions ---

export const {
  joinIntentStored,
  joinIntentRestored,
  joinIntentCleared,
  friendIntentStored,
  friendIntentRestored,
  friendIntentCleared,
} = joinIntentSlice.actions
export const joinIntentReducer = joinIntentSlice.reducer

// --- Selectors ---

type StateWithJoinIntent = { readonly joinIntent: JoinIntentState }

export const selectPendingJoinToken = (state: StateWithJoinIntent) =>
  state.joinIntent.token

export const selectPendingFriendToken = (state: StateWithJoinIntent) =>
  state.joinIntent.friendToken
