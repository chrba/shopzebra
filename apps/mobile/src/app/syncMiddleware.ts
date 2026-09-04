// Effects only (sync-engine.md §3): every dispatched action is offered
// to the sync engine, which asks the sync policy whether it enters the
// outbox. No per-feature handlers — a new synced event costs zero
// sync code.

import type { Middleware } from '@reduxjs/toolkit'
import { isPayloadAction } from './createSlice'
import { syncEngine } from './sync/syncEngine'

export const syncMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action)
  if (isPayloadAction(action)) syncEngine.record(action)
  return result
}
