import { setItem } from '../../../app/clientStorage'
import { isEventsConfirmed } from '../../../app/sync/withSync'
import { listDropped, listRestored, ownerNamesLoaded } from './listsSlice'
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
  // Dropping removes a list from the confirmed tree; without this the old
  // state returns on the next start.
  //
  // Owner names belong here too, even though no event carries them: they
  // come from GET /lists and fold into the confirmed tree like everything
  // else. Left out, a restart shows "Mitglied" on every shared list until
  // the network answers — the name would flash in seconds later.
  if (
    !isEventsConfirmed(action) &&
    !listDropped.match(action) &&
    !listRestored.match(action) &&
    !ownerNamesLoaded.match(action)
  ) {
    return
  }
  const state = getState() as {
    readonly sync: { readonly confirmed: { readonly lists: ListsState } }
  }
  void setItem(LISTS_KEY, JSON.stringify(state.sync.confirmed.lists.lists))
}
