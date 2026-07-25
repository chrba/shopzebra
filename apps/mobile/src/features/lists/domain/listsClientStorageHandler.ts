import { setItem } from '../../../app/clientStorage'
import { listCreated, listRenamed, listDeleted } from './listsSlice'
import type { ShoppingList } from './listsDomain'

type ListsState = {
  readonly lists: readonly ShoppingList[]
}

const LISTS_KEY = 'shopzebra_lists'

/**
 * Persists the lists domain state to client storage after every
 * relevant action. Called by clientStorageMiddleware
 * (app/clientStorageMiddleware.ts) after each dispatch.
 */
export function listsClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  if (
    listCreated.match(action) ||
    listRenamed.match(action) ||
    listDeleted.match(action)
  ) {
    const state = (getState() as { readonly lists: ListsState }).lists
    void setItem(LISTS_KEY, JSON.stringify(state.lists))
  }
}
