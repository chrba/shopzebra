import type { Middleware } from '@reduxjs/toolkit'
import { setItem } from './storage'
import type { ShoppingList } from '../features/lists/listsSlice'

const LISTS_KEY = 'shopzebra_lists'

export const listsPersistenceMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)

  const actionType = (action as { readonly type: string }).type

  if (actionType === 'lists/listCreated' || actionType === 'lists/listDeleted') {
    const state = api.getState() as { readonly lists: { readonly lists: readonly ShoppingList[] } }
    void setItem(LISTS_KEY, JSON.stringify(state.lists.lists))
  }

  return result
}
