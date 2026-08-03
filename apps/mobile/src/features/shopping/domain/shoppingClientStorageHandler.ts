import { setItem } from '../../../app/clientStorage'
import { isEventsConfirmed } from '../../../app/sync/withSync'
import { identityAttached } from '../../auth/domain/authSlice'
import { listLeft } from '../../lists/domain/listsSlice'
import type { ListItem } from './shoppingDomain'

type ShoppingState = {
  readonly itemsByListId: { readonly [listId: string]: readonly ListItem[] }
  readonly customVariantsByListId: {
    readonly [listId: string]: {
      readonly [productId: string]: readonly string[]
    }
  }
}

export const SHOPPING_STORAGE_KEY = 'shopzebra_shopping'

/**
 * Persists the CONFIRMED shopping tree whenever a server batch folded in.
 * Called by clientStorageMiddleware after each dispatch. Optimistic local
 * events are deliberately not persisted here — they survive restarts via
 * the outbox queue and are replayed through pendingRestored.
 */
export function shoppingClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  // Docking rewrites the confirmed tree in place and leaving drops a
  // list from it; without these the old state returns on the next start.
  if (
    !isEventsConfirmed(action) &&
    !identityAttached.match(action) &&
    !listLeft.match(action)
  ) {
    return
  }
  const state = getState() as {
    readonly sync: { readonly confirmed: { readonly shopping: ShoppingState } }
  }
  void setItem(
    SHOPPING_STORAGE_KEY,
    JSON.stringify(state.sync.confirmed.shopping),
  )
}
