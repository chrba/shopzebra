// Persists Redux state to clientStorage after every dispatch.
//
// Works like syncMiddleware but writes to the device instead
// of the server. Each feature provides a handler that decides
// which actions trigger a write and what to store.
//
// New features just add their handler to the array below.

import type { Middleware } from '@reduxjs/toolkit'
import { listsClientStorageHandler } from '../features/lists/model/listsClientStorageHandler'

type ClientStorageHandler = (
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
) => void

const handlers: readonly ClientStorageHandler[] = [
  listsClientStorageHandler,
]

export const clientStorageMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)
  for (const handler of handlers) {
    handler(action as { readonly type: string; readonly payload?: unknown }, api.getState)
  }
  return result
}
