import { createSlice, type PayloadAction } from '../../../app/createSlice'
import { LOCAL_USER_ID } from './localUser'

// --- Types ---

/**
 * Identity provider a linked account signs in with. A guest has none —
 * its account exists, but nobody ever chose credentials for it.
 */
export type AuthProvider = 'email' | 'google' | 'apple'

/**
 * Who this device is, in three states (accountless-first-planned.md):
 * `none` before the first share — everything is local and the sentinel
 * authors it; `guest` once the shadow account exists; `linked` once an
 * email or a social account was attached to that same Cognito user. The
 * userId never changes between guest and linked — linking upgrades the
 * account, it does not migrate anything.
 */
export type Identity =
  | { readonly kind: 'none' }
  | { readonly kind: 'guest'; readonly userId: string; readonly name: string }
  | {
      readonly kind: 'linked'
      readonly userId: string
      readonly name: string
      readonly email: string | null
      readonly provider: AuthProvider
    }

/** An identity that exists — everything the app can act as. */
export type EstablishedIdentity = Exclude<Identity, { readonly kind: 'none' }>

type AuthState = {
  readonly identity: Identity
}

// --- Slice ---

const initialState: AuthState = {
  identity: { kind: 'none' },
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // The shadow account exists from now on. Dispatched by ensureIdentity
    // after Cognito confirmed it, and at boot for a restored session.
    guestIdentityCreated: (
      state: AuthState,
      action: PayloadAction<{
        readonly userId: string
        readonly name: string
      }>,
    ): AuthState => ({
      ...state,
      identity: {
        kind: 'guest',
        userId: action.payload.userId,
        name: action.payload.name,
      },
    }),

    // Same account, now reachable by email or a social provider (M2).
    identityLinked: (
      state: AuthState,
      action: PayloadAction<{
        readonly email: string | null
        readonly provider: AuthProvider
      }>,
    ): AuthState =>
      state.identity.kind === 'none'
        ? state
        : {
            ...state,
            identity: {
              kind: 'linked',
              userId: state.identity.userId,
              name: state.identity.name,
              email: action.payload.email,
              provider: action.payload.provider,
            },
          },

    linkedIdentityRestored: (
      state: AuthState,
      action: PayloadAction<{
        readonly userId: string
        readonly name: string
        readonly email: string | null
        readonly provider: AuthProvider
      }>,
    ): AuthState => ({
      ...state,
      identity: { kind: 'linked', ...action.payload },
    }),

    // Announces the docking. Folded by lists/recipes via extraReducers —
    // the auth slice itself holds no per-aggregate data.
    identityAttached: (
      state: AuthState,
      _action: PayloadAction<{
        readonly previousUserId: string
        readonly userId: string
      }>,
    ): AuthState => state,

    // The name lives in Cognito; this mirrors the accepted write so the
    // profile and the members screen agree without a session refresh.
    displayNameChanged: (
      state: AuthState,
      action: PayloadAction<{ readonly name: string }>,
    ): AuthState =>
      state.identity.kind === 'none'
        ? state
        : {
            ...state,
            identity: { ...state.identity, name: action.payload.name },
          },

    identityCleared: (state: AuthState): AuthState => ({
      ...state,
      identity: { kind: 'none' },
    }),
  },
})

// --- Actions ---

export const {
  guestIdentityCreated,
  identityLinked,
  linkedIdentityRestored,
  identityAttached,
  displayNameChanged,
  identityCleared,
} = authSlice.actions

export const authReducer = authSlice.reducer

// --- Selectors ---

type StateWithAuth = { readonly auth: AuthState }

export const selectIdentity = (state: StateWithAuth): Identity =>
  state.auth.identity

/** True once a Cognito account exists — the binary sync rule reads this. */
export const selectHasIdentity = (state: StateWithAuth): boolean =>
  state.auth.identity.kind !== 'none'

export const selectIsGuest = (state: StateWithAuth): boolean =>
  state.auth.identity.kind === 'guest'

export const selectDisplayName = (state: StateWithAuth): string =>
  state.auth.identity.kind === 'none' ? '' : state.auth.identity.name

/** The author of everything this device writes — sentinel until attached. */
export const selectCurrentUserId = (state: StateWithAuth): string =>
  state.auth.identity.kind === 'none'
    ? LOCAL_USER_ID
    : state.auth.identity.userId
