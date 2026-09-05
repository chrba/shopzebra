import { createSlice, type PayloadAction } from '../../../app/createSlice'

// --- Types ---

/**
 * Identity provider a linked account signs in with. A guest has none —
 * its account exists, but nobody ever chose credentials for it.
 */
export type AuthProvider = 'email' | 'google' | 'apple'

/**
 * Who this device is, in three states. `local`: the id is minted, no account
 * exists — everything stays on the device. `guest`: the shadow account
 * exists under that same id. `linked`: an email or a social account was
 * attached to the same Cognito user. The userId never changes across the
 * three — the account is created under it, linking upgrades the account.
 *
 * A name exists in every state, drawn at the very first start.
 */
export type Identity =
  | { readonly kind: 'local'; readonly userId: string; readonly name: string }
  | { readonly kind: 'guest'; readonly userId: string; readonly name: string }
  | {
      readonly kind: 'linked'
      readonly userId: string
      readonly name: string
      readonly email: string | null
      readonly provider: AuthProvider
    }

/** An identity with an account behind it — what may talk to the server. */
export type EstablishedIdentity = Exclude<Identity, { readonly kind: 'local' }>

type AuthState = {
  readonly identity: Identity
}

// --- Slice ---

const initialState: AuthState = {
  // Empty only until the boot hands id and name over.
  identity: { kind: 'local', userId: '', name: '' },
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Who this device is: id and name, both minted at the first start and
     * restored from storage on every later one. Dispatched before the
     * identity is restored, so an account Cognito knows still wins.
     */
    deviceIdentified: (
      state: AuthState,
      action: PayloadAction<{ readonly userId: string; readonly name: string }>,
    ): AuthState => ({
      ...state,
      identity: {
        kind: 'local',
        userId: action.payload.userId,
        name: action.payload.name,
      },
    }),

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
        // Accounts from before the naming carry none — the drawn name stands.
        name: action.payload.name || state.identity.name,
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
      state.identity.kind === 'local'
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
      identity: {
        kind: 'linked',
        ...action.payload,
        name: action.payload.name || state.identity.name,
      },
    }),

    // The name lives in Cognito; this mirrors the accepted write so the
    // profile and the members screen agree without a session refresh.
    displayNameChanged: (
      state: AuthState,
      action: PayloadAction<{ readonly name: string }>,
    ): AuthState => ({
      ...state,
      identity: { ...state.identity, name: action.payload.name },
    }),

    // Signing out ends the account, not the device — the name stays, the id
    // is fresh: the old one belongs to the account that just left.
    identityCleared: (
      state: AuthState,
      action: PayloadAction<{ readonly userId: string }>,
    ): AuthState => ({
      ...state,
      identity: {
        kind: 'local',
        userId: action.payload.userId,
        name: state.identity.name,
      },
    }),
  },
})

// --- Actions ---

export const {
  deviceIdentified,
  guestIdentityCreated,
  identityLinked,
  linkedIdentityRestored,
  displayNameChanged,
  identityCleared,
} = authSlice.actions

export const authReducer = authSlice.reducer

// --- Selectors ---

type StateWithAuth = { readonly auth: AuthState }

export const selectIdentity = (state: StateWithAuth): Identity =>
  state.auth.identity

/** True once a Cognito account exists — the binary sync rule reads this. */
export const selectHasAccount = (state: StateWithAuth): boolean =>
  state.auth.identity.kind !== 'local'

export const selectIsGuest = (state: StateWithAuth): boolean =>
  state.auth.identity.kind === 'guest'

/** What this device is called — never empty once the boot has run. */
export const selectDisplayName = (state: StateWithAuth): string =>
  state.auth.identity.name

/** The author of everything this device writes — the same id in every state. */
export const selectCurrentUserId = (state: StateWithAuth): string =>
  state.auth.identity.userId
