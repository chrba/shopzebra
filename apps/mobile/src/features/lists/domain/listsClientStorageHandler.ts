import { setItem } from '../../../app/clientStorage'
import { isEventsConfirmed } from '../../../app/sync/withSync'
import type { ShoppingList } from './listsDomain'

type ListsState = {
  readonly lists: readonly ShoppingList[]
}

const LISTS_KEY = 'shopzebra_lists'

/**
 * Persists the CONFIRMED lists tree whenever a server batch folded in.
 * Called by clientStorageMiddleware after each dispatch. Optimistic local
 * events are deliberately not persisted here — they survive restarts via
 * the outbox queue and are replayed through pendingRestored.
 */
export function listsClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  if (!isEventsConfirmed(action)) return
  const state = getState() as {
    readonly sync: { readonly confirmed: { readonly lists: ListsState } }
  }
  void setItem(LISTS_KEY, JSON.stringify(state.sync.confirmed.lists.lists))
}
