// Attaches a unique eventId to every dispatched action.
// Used for idempotency when syncing events to the backend.

import type { Middleware } from '@reduxjs/toolkit'
import { isPayloadAction } from './createSlice'

export const eventIdMiddleware: Middleware = () => (next) => (action) => {
  if (!isPayloadAction(action)) return next(action)
  return next({ ...action, meta: { ...action.meta, eventId: crypto.randomUUID() } })
}
