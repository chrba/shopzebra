// Central Redux store. The feature reducers are combined and wrapped
// with withSync (stage 2): the visible tree stays at top level so every
// selector, middleware and getState() caller reads it unchanged; the
// confirmed tree and the pending queue live under `state.sync`.

import {
  combineReducers,
  configureStore,
  type UnknownAction,
} from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { listsReducer } from '../features/lists/domain/listsSlice'
import { joinIntentReducer } from '../features/lists/join/joinIntentSlice'
import { shoppingReducer } from '../features/shopping/domain/shoppingSlice'
import { preferencesReducer } from '../features/preferences/domain/preferencesSlice'
import { authReducer } from '../features/auth/domain/authSlice'
import { appReducer } from './appSlice'
import { isPayloadAction, type PayloadAction } from './createSlice'
import { withSync, type SyncState } from './sync/withSync'
import { needsSync } from './sync/needsSync'
import { eventIdMiddleware } from './eventIdMiddleware'
import { themeMiddleware } from './themeMiddleware'
import { clientStorageMiddleware } from './clientStorageMiddleware'
import { syncMiddleware } from './syncMiddleware'

const featureReducer = combineReducers({
  app: appReducer,
  auth: authReducer,
  lists: listsReducer,
  joinIntent: joinIntentReducer,
  shopping: shoppingReducer,
  preferences: preferencesReducer,
})

type FeatureState = ReturnType<typeof featureReducer>

// `sync` is a reserved top-level key — no feature slice may use that name.
export type RootState = FeatureState & {
  readonly sync: {
    readonly confirmed: FeatureState
    readonly pending: readonly PayloadAction<unknown>[]
  }
}

const syncedReducer = withSync<FeatureState>(featureReducer, needsSync)

function toSyncState(state: RootState): SyncState<FeatureState> {
  const { sync, ...visible } = state
  return { confirmed: sync.confirmed, pending: sync.pending, visible }
}

/** Adapter between the store shape and withSync's { confirmed, pending, visible }. */
function rootReducer(
  state: RootState | undefined,
  action: UnknownAction,
): RootState {
  const payloadAction: PayloadAction<unknown> = isPayloadAction(action)
    ? action
    : { type: action.type, payload: undefined }
  const next = syncedReducer(
    state === undefined ? undefined : toSyncState(state),
    payloadAction,
  )
  return {
    ...next.visible,
    sync: { confirmed: next.confirmed, pending: next.pending },
  }
}

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      eventIdMiddleware,
      themeMiddleware,
      clientStorageMiddleware,
      syncMiddleware,
    ),
})

export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
