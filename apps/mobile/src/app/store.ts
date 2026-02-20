import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { counterReducer } from '../features/example/counterSlice'
import { counterReducer as counterReducer2 } from '../features/example2/counterSlice'
import { counterReducer as counterReducer3 } from '../features/example3/counterSlice'
import { todoReducer } from '../features/example3/todoSlice'

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    counter2: counterReducer2,
    counter3: counterReducer3,
    todos3: todoReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
