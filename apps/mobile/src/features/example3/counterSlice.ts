import { createSlice, type PayloadAction } from './slice'

// --- Counter: einfache Reducer ohne prepare ---

type CounterState = {
  readonly value: number
}

const initialState: CounterState = { value: 0 }

const counterSlice = createSlice({
  name: 'counter3',
  initialState,
  reducers: {
    incremented: (state: CounterState) => ({ ...state, value: state.value + 1 }),
    decremented: (state: CounterState) => ({ ...state, value: state.value - 1 }),
    addedByAmount: (state: CounterState, action: PayloadAction<number>) => ({
      ...state,
      value: state.value + action.payload,
    }),
  },
})

export const { incremented, decremented, addedByAmount } = counterSlice.actions
export const counterReducer = counterSlice.reducer

export const selectCount = (state: { counter3: CounterState }) => state.counter3.value
