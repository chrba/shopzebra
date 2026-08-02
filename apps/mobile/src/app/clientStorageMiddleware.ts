// Persists Redux state to clientStorage after every dispatch.
//
// Works like syncMiddleware but writes to the device instead
// of the server. Each feature provides a handler that decides
// which actions trigger a write and what to store.
//
// New features just add their handler to the array below.

import type { Middleware } from '@reduxjs/toolkit'
import { listsClientStorageHandler } from '../features/lists/domain/listsClientStorageHandler'
import { joinIntentClientStorageHandler } from '../features/lists/join/joinIntentClientStorageHandler'
import { friendsClientStorageHandler } from '../features/friends/domain/friendsClientStorageHandler'
import { recipesClientStorageHandler } from '../features/recipes/domain/recipesClientStorageHandler'
import { shoppingClientStorageHandler } from '../features/shopping/domain/shoppingClientStorageHandler'
import { preferencesClientStorageHandler } from '../features/preferences/domain/preferencesClientStorageHandler'

type ClientStorageHandler = (
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
) => void

const handlers: readonly ClientStorageHandler[] = [
  listsClientStorageHandler,
  joinIntentClientStorageHandler,
  friendsClientStorageHandler,
  recipesClientStorageHandler,
  shoppingClientStorageHandler,
  preferencesClientStorageHandler,
]

export const clientStorageMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)
  for (const handler of handlers) {
    handler(action as { readonly type: string; readonly payload?: unknown }, api.getState)
  }
  return result
}
