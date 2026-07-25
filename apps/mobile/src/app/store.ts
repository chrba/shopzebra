// Central Redux store — single source of truth for all
// app state. Features register their reducers here;
// side-effect middlewares (sync, storage, theme) are
// added to the pipeline so they react to every dispatch.

import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { listsReducer } from '../features/lists/domain/listsSlice'
import { authReducer } from '../features/auth/domain/authSlice'
import { appReducer } from './appSlice'
import { eventIdMiddleware } from './eventIdMiddleware'
import { themeMiddleware } from './themeMiddleware'
import { clientStorageMiddleware } from './clientStorageMiddleware'
import { syncMiddleware } from './syncMiddleware'

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
    lists: listsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      eventIdMiddleware,
      themeMiddleware,
      clientStorageMiddleware,
      syncMiddleware,
    ),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
