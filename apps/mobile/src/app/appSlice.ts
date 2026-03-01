// Global app-level state that doesn't belong to any feature.
// Currently tracks the active theme; will hold connectivity
// status and other cross-cutting concerns as they emerge.

import { createSlice, type PayloadAction } from './createSlice'
import type { Theme } from './theme'

// --- Types ---

type AppState = {
  readonly theme: Theme
}

// --- Slice ---

const initialState: AppState = {
  theme: 'dark',
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    appLoaded: (
      _state: AppState,
      action: PayloadAction<{ readonly theme: Theme }>,
    ): AppState => ({
      theme: action.payload.theme,
    }),
  },
})

// --- Actions ---

export const { appLoaded } = appSlice.actions
export const appReducer = appSlice.reducer
