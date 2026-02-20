import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { incremented, decremented, addedByAmount, selectCount } from './counterSlice'
import { todoAdded, todoToggled, todosCleared, selectTodos, selectOpenCount } from './todoSlice'

export function ExamplePage3() {
  const dispatch = useAppDispatch()
  const count = useAppSelector(selectCount)
  const todos = useAppSelector(selectTodos)
  const openCount = useAppSelector(selectOpenCount)
  const [text, setText] = useState('')

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Redux Beispiel 3 (eigenes createSlice, kein Immer)</h1>

      <section>
        <h2>Counter (einfache Reducer)</h2>
        <p>Wert: {count}</p>
        <button onClick={() => dispatch(decremented())}>-1</button>{' '}
        <button onClick={() => dispatch(incremented())}>+1</button>{' '}
        <button onClick={() => dispatch(addedByAmount(5))}>+5</button>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Todos (mit prepare) — {openCount} offen</h2>
        <p style={{ color: '#666', fontSize: 14 }}>
          prepare erzeugt die ID vor dem Dispatch. Komponente ruft nur todoAdded('text') auf.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) {
              // Nur der Text — ID wird von prepare erzeugt, nicht von der Komponente
              dispatch(todoAdded(text.trim()))
              setText('')
            }
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Neues Todo..."
          />
          <button type="submit">Hinzufügen</button>
        </form>
        <ul>
          {todos.map((todo) => (
            <li
              key={todo.id}
              onClick={() => dispatch(todoToggled(todo.id))}
              style={{
                textDecoration: todo.done ? 'line-through' : 'none',
                cursor: 'pointer',
              }}
            >
              {todo.text} <small style={{ color: '#999' }}>({todo.id.slice(0, 8)}…)</small>
            </li>
          ))}
        </ul>
        {todos.some((t) => t.done) && (
          <button onClick={() => dispatch(todosCleared())}>Erledigte löschen</button>
        )}
      </section>
    </div>
  )
}
