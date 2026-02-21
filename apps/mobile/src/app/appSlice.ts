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

    themeToggled: (state: AppState): AppState => ({
      ...state,
      theme: state.theme === 'dark' ? 'glass' : 'dark',
    }),
  },
})

// --- Actions ---

export const { appLoaded, themeToggled } = appSlice.actions
export const appReducer = appSlice.reducer

// --- Selectors ---

export const selectTheme = (state: { readonly app: AppState }) => state.app.theme
