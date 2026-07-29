// Global app-level state that doesn't belong to any feature.
// Currently tracks the active theme; will hold connectivity
// status and other cross-cutting concerns as they emerge.

import { createSlice, type PayloadAction } from './createSlice'
import type { Theme } from './theme'

// --- Types ---

export type AppState = {
  readonly theme: Theme
  readonly deviceId: string
}

// --- Slice ---

const initialState: AppState = {
  theme: 'dark',
  deviceId: '',
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    appLoaded: (
      _state: AppState,
      action: PayloadAction<{
        readonly theme: Theme
        readonly deviceId: string
      }>,
    ): AppState => ({
      theme: action.payload.theme,
      deviceId: action.payload.deviceId,
    }),
  },
})

// --- Actions ---

export const { appLoaded } = appSlice.actions
export const appReducer = appSlice.reducer

// --- Selectors ---

export const selectDeviceId = (state: { readonly app: AppState }) =>
  state.app.deviceId

// deviceId is assigned in the final step of the startup bootstrap,
// so a non-empty value means the store is fully hydrated.
export const selectIsAppLoaded = (state: { readonly app: AppState }) =>
  state.app.deviceId !== ''
