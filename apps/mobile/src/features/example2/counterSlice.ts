// Ohne createSlice — alles manuell

type CounterState = {
  readonly value: number
}

const initialState: CounterState = { value: 0 }

// 1. Action Types — string constants
const INCREMENTED = 'counter2/incremented' as const
const DECREMENTED = 'counter2/decremented' as const
const ADDED_BY_AMOUNT = 'counter2/addedByAmount' as const

// 2. Action Types — Union Type für den Reducer
type CounterAction =
  | { type: typeof INCREMENTED }
  | { type: typeof DECREMENTED }
  | { type: typeof ADDED_BY_AMOUNT; payload: number }

// 3. Action Creators — Funktionen die Action-Objekte erzeugen
export const incremented = (): CounterAction => ({ type: INCREMENTED })
export const decremented = (): CounterAction => ({ type: DECREMENTED })
export const addedByAmount = (amount: number): CounterAction => ({ type: ADDED_BY_AMOUNT, payload: amount })

// 4. Reducer — switch/case statt builder, explizite immutable Updates statt Immer
export function counterReducer(state: CounterState = initialState, action: CounterAction): CounterState {
  switch (action.type) {
    case INCREMENTED:
      return { ...state, value: state.value + 1 }
    case DECREMENTED:
      return { ...state, value: state.value - 1 }
    case ADDED_BY_AMOUNT:
      return { ...state, value: state.value + action.payload }
    default:
      return state
  }
}

// 5. Selektor — identisch wie bei createSlice
export const selectCount = (state: { counter2: CounterState }) => state.counter2.value
