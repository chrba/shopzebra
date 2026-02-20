import { createSlice, type PayloadAction } from './slice'

// --- Todos: prepare-Beispiel ---
//
// Warum prepare?
// Reducer müssen pure sein (gleicher Input → gleicher Output).
// Redux DevTools, Hot Reload und StrictMode können Reducer mehrfach aufrufen.
// Ein crypto.randomUUID() im Reducer erzeugt jedes Mal eine andere ID → State kaputt.
//
// prepare läuft VOR dem Dispatch (einmal), die ID landet fix in der Action.
// Der Reducer bekommt sie fertig und bleibt pure.

type Todo = {
  readonly id: string
  readonly text: string
  readonly done: boolean
}

type TodoState = {
  readonly items: readonly Todo[]
}

const initialState: TodoState = { items: [] }

const todoSlice = createSlice({
  name: 'todos3',
  initialState,
  reducers: {
    // prepare: Komponente ruft todoAdded('Milch') auf.
    // prepare erzeugt die ID, Reducer bekommt { id, text } fertig.
    todoAdded: {
      prepare: (text: string) => ({
        payload: { id: crypto.randomUUID(), text },
      }),
      reducer: (state: TodoState, action: PayloadAction<{ readonly id: string; readonly text: string }>) => ({
        ...state,
        items: [...state.items, { ...action.payload, done: false }],
      }),
    },

    // Einfacher Reducer — kein prepare nötig (ID kommt von außen)
    todoToggled: (state: TodoState, action: PayloadAction<string>) => ({
      ...state,
      items: state.items.map((todo) =>
        todo.id === action.payload ? { ...todo, done: !todo.done } : todo,
      ),
    }),

    todosCleared: (state: TodoState) => ({
      ...state,
      items: state.items.filter((todo) => !todo.done),
    }),
  },
})

export const { todoAdded, todoToggled, todosCleared } = todoSlice.actions
export const todoReducer = todoSlice.reducer

export const selectTodos = (state: { todos3: TodoState }) => state.todos3.items
export const selectOpenCount = (state: { todos3: TodoState }) =>
  state.todos3.items.filter((t) => !t.done).length
