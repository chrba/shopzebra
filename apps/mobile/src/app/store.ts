import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { listsReducer } from '../features/lists/listsSlice'
import { appReducer } from './appSlice'
import { themeMiddleware } from './themeMiddleware'
import { listsPersistenceMiddleware } from './listsPersistenceMiddleware'

export const store = configureStore({
  reducer: {
    app: appReducer,
    lists: listsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(themeMiddleware, listsPersistenceMiddleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
