import { useAppDispatch, useAppSelector } from '../../app/store'
import { incremented, decremented, addedByAmount, selectCount } from './counterSlice'

// Komponente ist identisch — sie merkt keinen Unterschied
export function ExamplePage2() {
  const dispatch = useAppDispatch()
  const count = useAppSelector(selectCount)

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Redux Beispiel 2 (ohne createSlice)</h1>
      <p>Wert: {count}</p>
      <button onClick={() => dispatch(decremented())}>-1</button>{' '}
      <button onClick={() => dispatch(incremented())}>+1</button>{' '}
      <button onClick={() => dispatch(addedByAmount(5))}>+5</button>
    </div>
  )
}
