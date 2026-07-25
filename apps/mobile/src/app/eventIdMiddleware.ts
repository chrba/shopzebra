// Attaches event metadata to every dispatched action:
// - eventId: unique per event, used for idempotency when syncing to the backend
// - deviceId: identifies the originating device, used for filtering own events on sync

import type { Middleware } from '@reduxjs/toolkit'
import type { AppState } from './appSlice'
import { ActionMeta, isPayloadAction } from './createSlice'


// Middleware<DispatchExt, State>: the second type param types getState().
// We can't use RootState here because store.ts imports this middleware (circular dep).
// Instead we declare the slice shape inline — must match the "app" key in store.ts.
export const eventIdMiddleware: Middleware<{}, { readonly app: AppState }> = (storeAPI) => (next) => (action) => {
  if (!isPayloadAction(action)) return next(action);

  // Server-originated actions keep their identity: regenerating the eventId
  // would break server-side dedup and the pending-queue match on confirmation.
  if (action.meta?.remote) return next(action);

  const meta: ActionMeta = {
      ...action.meta,
      eventId: crypto.randomUUID(),
      deviceId: storeAPI.getState().app.deviceId,
  }
  return next({
    ...action,
    meta: {
      ...meta
    },
  })
}
