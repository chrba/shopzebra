import { setItem } from '../../../app/clientStorage'
import { listCreated, listUpdated, listDeleted, listPreferencesSet } from './listsSlice'
import type { ShoppingList, ListPreferences } from './listsSlice'

type ListsState = {
  readonly lists: readonly ShoppingList[]
  readonly preferences: { readonly [listId: string]: ListPreferences }
}

const LISTS_KEY = 'shopzebra_lists'
const PREFS_KEY = 'shopzebra_list_preferences'

/**
 * Persists lists state to client storage after every
 * relevant action. Called by clientStorageMiddleware
 * (app/clientStorageMiddleware.ts) after each dispatch.
 * Domain (lists) and preferences are stored under
 * separate keys.
 */
export function listsClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  const state = (getState() as { readonly lists: ListsState }).lists

  if (listCreated.match(action) || listUpdated.match(action) || listDeleted.match(action)) {
    void setItem(LISTS_KEY, JSON.stringify(state.lists))
  }

  if (listPreferencesSet.match(action) || listDeleted.match(action)) {
    void setItem(PREFS_KEY, JSON.stringify(state.preferences))
  }
}
