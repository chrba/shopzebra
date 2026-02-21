import { createSlice, type PayloadAction } from '../../../app/createSlice'

// --- Types ---

export type AuthProvider = 'email' | 'google' | 'apple'

export type AuthUser = {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly provider: AuthProvider
}

type AuthState = {
  readonly user: AuthUser | null
  readonly status: 'checking' | 'idle' | 'loading'
  readonly error: string | null
  readonly confirmationPending: boolean
  readonly resetPending: boolean
  readonly pendingEmail: string | null
}

// --- Slice ---

const initialState: AuthState = {
  user: null,
  status: 'checking',
  error: null,
  confirmationPending: false,
  resetPending: false,
  pendingEmail: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionRestored: (
      state: AuthState,
      action: PayloadAction<{ readonly user: AuthUser }>,
    ): AuthState => ({
      ...state,
      user: action.payload.user,
      status: 'idle',
    }),

    sessionNotFound: (state: AuthState): AuthState => ({
      ...state,
      user: null,
      status: 'idle',
    }),

    authLoading: (state: AuthState): AuthState => ({
      ...state,
      status: 'loading',
      error: null,
    }),

    signInSucceeded: (
      state: AuthState,
      action: PayloadAction<{ readonly user: AuthUser }>,
    ): AuthState => ({
      ...state,
      user: action.payload.user,
      status: 'idle',
      error: null,
    }),

    signInFailed: (
      state: AuthState,
      action: PayloadAction<{ readonly error: string }>,
    ): AuthState => ({
      ...state,
      status: 'idle',
      error: action.payload.error,
    }),

    signUpSucceeded: (
      state: AuthState,
      action: PayloadAction<{ readonly email: string }>,
    ): AuthState => ({
      ...state,
      status: 'idle',
      error: null,
      confirmationPending: true,
      pendingEmail: action.payload.email,
    }),

    signUpFailed: (
      state: AuthState,
      action: PayloadAction<{ readonly error: string }>,
    ): AuthState => ({
      ...state,
      status: 'idle',
      error: action.payload.error,
    }),

    confirmSignUpSucceeded: (state: AuthState): AuthState => ({
      ...state,
      status: 'idle',
      error: null,
      confirmationPending: false,
      pendingEmail: null,
    }),

    confirmSignUpFailed: (
      state: AuthState,
      action: PayloadAction<{ readonly error: string }>,
    ): AuthState => ({
      ...state,
      status: 'idle',
      error: action.payload.error,
    }),

    forgotPasswordCodeSent: (
      state: AuthState,
      action: PayloadAction<{ readonly email: string }>,
    ): AuthState => ({
      ...state,
      status: 'idle',
      error: null,
      resetPending: true,
      pendingEmail: action.payload.email,
    }),

    forgotPasswordFailed: (
      state: AuthState,
      action: PayloadAction<{ readonly error: string }>,
    ): AuthState => ({
      ...state,
      status: 'idle',
      error: action.payload.error,
    }),

    resetPasswordSucceeded: (state: AuthState): AuthState => ({
      ...state,
      status: 'idle',
      error: null,
      resetPending: false,
      pendingEmail: null,
    }),

    resetPasswordFailed: (
      state: AuthState,
      action: PayloadAction<{ readonly error: string }>,
    ): AuthState => ({
      ...state,
      status: 'idle',
      error: action.payload.error,
    }),

    signedOut: (state: AuthState): AuthState => ({
      ...state,
      user: null,
      status: 'idle',
      error: null,
      confirmationPending: false,
      resetPending: false,
      pendingEmail: null,
    }),

    authErrorCleared: (state: AuthState): AuthState => ({
      ...state,
      error: null,
    }),
  },
})

// --- Actions ---

export const {
  sessionRestored,
  sessionNotFound,
  authLoading,
  signInSucceeded,
  signInFailed,
  signUpSucceeded,
  signUpFailed,
  confirmSignUpSucceeded,
  confirmSignUpFailed,
  forgotPasswordCodeSent,
  forgotPasswordFailed,
  resetPasswordSucceeded,
  resetPasswordFailed,
  signedOut,
  authErrorCleared,
} = authSlice.actions

export const authReducer = authSlice.reducer

// --- Selectors ---

type StateWithAuth = { readonly auth: AuthState }

export const selectAuthUser = (state: StateWithAuth) => state.auth.user
export const selectIsAuthenticated = (state: StateWithAuth) =>
  state.auth.user !== null
export const selectAuthStatus = (state: StateWithAuth) => state.auth.status
export const selectAuthError = (state: StateWithAuth) => state.auth.error
export const selectConfirmationPending = (state: StateWithAuth) =>
  state.auth.confirmationPending
export const selectResetPending = (state: StateWithAuth) =>
  state.auth.resetPending
export const selectPendingEmail = (state: StateWithAuth) =>
  state.auth.pendingEmail
