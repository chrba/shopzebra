import { createSlice, type PayloadAction } from '../../../app/createSlice'
import { listDeleted } from '../../lists/domain/listsSlice'
import { recipeDeleted } from '../../recipes/domain/recipesSlice'
import type { ListPreferences, RecipePreferences } from './preferencesDomain'

type PreferencesState = {
  readonly listPrefs: { readonly [listId: string]: ListPreferences }
  readonly recipePrefs: { readonly [recipeId: string]: RecipePreferences }
}

const initialState: PreferencesState = {
  listPrefs: {},
  recipePrefs: {},
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    listPreferencesLoaded: (
      state: PreferencesState,
      action: PayloadAction<{ readonly [listId: string]: ListPreferences }>,
    ): PreferencesState => ({
      ...state,
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

    recipePreferencesLoaded: (
      state: PreferencesState,
      action: PayloadAction<{
        readonly [recipeId: string]: RecipePreferences
      }>,
    ): PreferencesState => ({
      ...state,
      recipePrefs: action.payload,
    }),

    recipePreferencesSet: (
      state: PreferencesState,
      action: PayloadAction<{
        readonly recipeId: string
        readonly preferences: RecipePreferences
      }>,
    ): PreferencesState => ({
      ...state,
      recipePrefs: {
        ...state.recipePrefs,
        [action.payload.recipeId]: action.payload.preferences,
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
    {
      // Preferences of a deleted recipe are orphans — clean them up.
      creator: recipeDeleted,
      reducer: (
        state: PreferencesState,
        action: PayloadAction<{ readonly recipeId: string }>,
      ): PreferencesState => ({
        ...state,
        recipePrefs: Object.fromEntries(
          Object.entries(state.recipePrefs).filter(
            ([recipeId]) => recipeId !== action.payload.recipeId,
          ),
        ),
      }),
    },
  ],
})

// --- Actions ---

export const {
  listPreferencesLoaded,
  listPreferencesSet,
  recipePreferencesLoaded,
  recipePreferencesSet,
} = preferencesSlice.actions
export const preferencesReducer = preferencesSlice.reducer

// --- Selectors ---

type StateWithPreferences = { readonly preferences: PreferencesState }

export const selectAllListPreferences = (state: StateWithPreferences) =>
  state.preferences.listPrefs

export const selectListPreferences = (
  state: StateWithPreferences,
  listId: string,
) => state.preferences.listPrefs[listId] ?? null

export const selectAllRecipePreferences = (state: StateWithPreferences) =>
  state.preferences.recipePrefs

export const selectRecipePreferences = (
  state: StateWithPreferences,
  recipeId: string,
) => state.preferences.recipePrefs[recipeId] ?? null
