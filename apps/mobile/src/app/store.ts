import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { listsReducer } from '../features/lists/state/listsSlice'
import { authReducer } from '../features/auth/state/authSlice'
import { appReducer } from './appSlice'
import { themeMiddleware } from './themeMiddleware'
import { listsPersistenceMiddleware } from './listsPersistenceMiddleware'
import { syncMiddleware } from '../sync/syncMiddleware'

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
    lists: listsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      themeMiddleware,
      listsPersistenceMiddleware,
      syncMiddleware,
    ),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
