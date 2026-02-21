// Sends local changes to the server.
//
// When a user creates or deletes a list, the store updates immediately (optimistic).
// This middleware sees that action and tells the server about it.
//
// Actions that already came FROM the server (tagged with fromServer()) are skipped —
// otherwise we'd send them right back in a loop.
//
//   User creates list → store updates → middleware → API call
//   Server pushes list → store updates → middleware → skipped (already synced)
//
// Each feature decides which actions to sync (see listsSync.ts).
// New features just add their handler to the array below.

import type { Middleware } from '@reduxjs/toolkit'
import { listsSyncHandler } from '../features/lists/state/listsSync'

type SyncHandler = (action: { readonly type: string; readonly payload?: unknown }) => Promise<void> | null

const handlers: readonly SyncHandler[] = [
  listsSyncHandler,
]

export const syncMiddleware: Middleware = (_api) => (next) => (action) => {
  const result = next(action)

  const meta = (action as { readonly meta?: { readonly remote?: boolean } }).meta
  if (meta?.remote) return result

  for (const handler of handlers) {
    const promise = handler(action as { readonly type: string; readonly payload?: unknown })
    if (promise) {
      void promise // Later: void syncOrQueue(promise) for offline queue
      break
    }
  }

  return result
}
