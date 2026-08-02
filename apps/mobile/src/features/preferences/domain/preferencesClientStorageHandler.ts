import { setItem } from '../../../app/clientStorage'
import { listDeleted } from '../../lists/domain/listsSlice'
import { recipeDeleted } from '../../recipes/domain/recipesSlice'
import { listPreferencesSet, recipePreferencesSet } from './preferencesSlice'
import type { ListPreferences, RecipePreferences } from './preferencesDomain'

type PreferencesState = {
  readonly listPrefs: { readonly [listId: string]: ListPreferences }
  readonly recipePrefs: { readonly [recipeId: string]: RecipePreferences }
}

export const LIST_PREFS_KEY = 'shopzebra_list_preferences'
export const RECIPE_PREFS_KEY = 'shopzebra_recipe_preferences'

/**
 * Persists local preferences to client storage — separate keys from the
 * domain state, because preferences are per-device and never synced.
 * Also reacts to the delete events, since the slice drops orphaned
 * preferences along with the thing they belonged to.
 */
export function preferencesClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  const preferencesOf = () =>
    (getState() as { readonly preferences: PreferencesState }).preferences

  if (listPreferencesSet.match(action) || listDeleted.match(action)) {
    void setItem(LIST_PREFS_KEY, JSON.stringify(preferencesOf().listPrefs))
  }
  if (recipePreferencesSet.match(action) || recipeDeleted.match(action)) {
    void setItem(RECIPE_PREFS_KEY, JSON.stringify(preferencesOf().recipePrefs))
  }
}
