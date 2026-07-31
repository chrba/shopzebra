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
  readonly token: string | null
}

const initialState: JoinIntentState = { token: null }

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
    joinIntentCleared: (): JoinIntentState => initialState,
  },
})

// --- Actions ---

export const { joinIntentStored, joinIntentRestored, joinIntentCleared } =
  joinIntentSlice.actions
export const joinIntentReducer = joinIntentSlice.reducer

// --- Selectors ---

type StateWithJoinIntent = { readonly joinIntent: JoinIntentState }

export const selectPendingJoinToken = (state: StateWithJoinIntent) =>
  state.joinIntent.token
