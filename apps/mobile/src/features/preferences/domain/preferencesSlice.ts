import { createSlice, type PayloadAction } from '../../../app/createSlice'
import { listDeleted } from '../../lists/domain/listsSlice'
import type { ListPreferences } from './preferencesDomain'

type PreferencesState = {
  readonly listPrefs: { readonly [listId: string]: ListPreferences }
}

const initialState: PreferencesState = {
  listPrefs: {},
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    listPreferencesLoaded: (
      _state: PreferencesState,
      action: PayloadAction<{ readonly [listId: string]: ListPreferences }>,
    ): PreferencesState => ({
      listPrefs: action.payload,
    }),

    listPreferencesSet: (
      state: PreferencesState,
      action: PayloadAction<{
        readonly listId: string
        readonly preferences: ListPreferences
      }>,
    ): PreferencesState => ({
      ...state,
      listPrefs: {
        ...state.listPrefs,
        [action.payload.listId]: action.payload.preferences,
      },
    }),
  },
  extraReducers: [
    {
      // Preferences of a deleted list are orphans — clean them up.
      creator: listDeleted,
      reducer: (
        state: PreferencesState,
        action: PayloadAction<{ readonly listId: string }>,
      ): PreferencesState => ({
        ...state,
        listPrefs: Object.fromEntries(
          Object.entries(state.listPrefs).filter(
            ([listId]) => listId !== action.payload.listId,
          ),
        ),
      }),
    },
  ],
})

// --- Actions ---

export const { listPreferencesLoaded, listPreferencesSet } =
  preferencesSlice.actions
export const preferencesReducer = preferencesSlice.reducer

// --- Selectors ---

type StateWithPreferences = { readonly preferences: PreferencesState }

export const selectAllListPreferences = (state: StateWithPreferences) =>
  state.preferences.listPrefs

export const selectListPreferences = (
  state: StateWithPreferences,
  listId: string,
) => state.preferences.listPrefs[listId] ?? null
