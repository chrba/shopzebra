import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

// createSlice = der Standard-Weg
// Kombiniert Actions + Reducer in einem Objekt

type CounterState = {
  readonly value: number
}

const initialState: CounterState = { value: 0 }

const counterSlice = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    // Jede Funktion hier erzeugt automatisch eine Action
    // counterSlice.actions.incremented() → { type: 'counter/incremented' }
    incremented(state) {
      state.value += 1 // Immer erlaubt "mutierenden" Code — sieht aus wie Mutation, ist aber immutable
    },
    decremented(state) {
      state.value -= 1
    },
    // PayloadAction<T> typisiert die action.payload
    addedByAmount(state, action: PayloadAction<number>) {
      state.value += action.payload
    },
  },
})

// Actions exportieren — diese dispatcht die Komponente
export const { incremented, decremented, addedByAmount } = counterSlice.actions

// Selektor — lebt im Slice, nicht in der Komponente
export const selectCount = (state: { counter: CounterState }) => state.counter.value

// Reducer exportieren — wird im Store registriert
export const counterReducer = counterSlice.reducer
