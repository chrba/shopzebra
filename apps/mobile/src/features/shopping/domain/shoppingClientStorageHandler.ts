import { setItem } from '../../../app/clientStorage'
import { listDeleted } from '../../lists/domain/listsSlice'
import {
  customVariantAdded,
  itemAdded,
  itemChecked,
  itemNoteUpdated,
  itemRemoved,
  itemUnchecked,
  itemUpdated,
} from './shoppingSlice'
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

const persistedActions = [
  itemAdded,
  itemChecked,
  itemUnchecked,
  itemRemoved,
  itemUpdated,
  itemNoteUpdated,
  customVariantAdded,
  listDeleted,
]

/**
 * Persists the shopping domain state to client storage after every
 * relevant action. Called by clientStorageMiddleware after each dispatch.
 */
export function shoppingClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  if (persistedActions.some((creator) => creator.match(action))) {
    const state = (getState() as { readonly shopping: ShoppingState }).shopping
    void setItem(SHOPPING_STORAGE_KEY, JSON.stringify(state))
  }
}
