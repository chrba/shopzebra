import { setItem } from '../../../app/clientStorage'
import { listDeleted } from '../../lists/domain/listsSlice'
import { listPreferencesSet } from './preferencesSlice'
import type { ListPreferences } from './preferencesDomain'

type PreferencesState = {
  readonly listPrefs: { readonly [listId: string]: ListPreferences }
}

const PREFS_KEY = 'shopzebra_list_preferences'

/**
 * Persists local preferences to client storage — separate key from the
 * domain state, because preferences are per-device and never synced.
 * Also reacts to listDeleted since the slice drops orphaned preferences.
 */
export function preferencesClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  if (listPreferencesSet.match(action) || listDeleted.match(action)) {
    const state = (getState() as { readonly preferences: PreferencesState })
      .preferences
    void setItem(PREFS_KEY, JSON.stringify(state.listPrefs))
  }
}
