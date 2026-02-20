// Eigenes createSlice — gleiche API wie RTK, aber ohne Immer.
// Reducer-Funktionen MÜSSEN neuen State returnen (Spread statt Mutation).

export type PayloadAction<P> = {
  readonly type: string
  readonly payload: P
}

// --- Reducer-Definition: einfache Funktion oder { prepare, reducer } ---
//
// prepare wird gebraucht für nicht-deterministische Werte (IDs, Timestamps, Random).
// Reducer müssen pure sein — gleicher Input, gleicher Output. Redux DevTools,
// Hot Reload und Strict Mode können Reducer mehrfach mit der gleichen Action aufrufen.
// Ein crypto.randomUUID() im Reducer erzeugt dann jedes Mal eine andere ID → kaputt.
// prepare läuft VOR dem Dispatch (nur einmal), das Ergebnis landet fix in der Action.

type ReducerFunction<S> = ((state: S) => S) | ((state: S, action: PayloadAction<any>) => S)

type ReducerWithPrepare<S> = {
  readonly prepare: (...args: any[]) => { readonly payload: any }
  readonly reducer: (state: S, action: PayloadAction<any>) => S
}

type ReducerDefinition<S> = ReducerFunction<S> | ReducerWithPrepare<S>

// --- Action Creator Inferenz ---

type InferActionCreatorFromFunction<Name extends string, Key extends string, R> =
  R extends (...args: infer A) => any
    ? A extends [any, PayloadAction<infer P>]
      ? (payload: P) => { readonly type: `${Name}/${Key}`; readonly payload: P }
      : () => { readonly type: `${Name}/${Key}` }
    : never

type InferActionCreatorFromPrepare<Name extends string, Key extends string, R> =
  R extends { readonly prepare: (...args: infer A) => { readonly payload: infer P } }
    ? (...args: A) => { readonly type: `${Name}/${Key}`; readonly payload: P }
    : never

type InferActionCreator<Name extends string, Key extends string, R> =
  R extends { readonly prepare: any; readonly reducer: any }
    ? InferActionCreatorFromPrepare<Name, Key, R>
    : InferActionCreatorFromFunction<Name, Key, R>

type ActionCreators<Name extends string, R extends Record<string, any>> = {
  readonly [K in keyof R & string]: InferActionCreator<Name, K, R[K]>
}

// --- createSlice ---

export function createSlice<
  Name extends string,
  S,
  R extends Record<string, ReducerDefinition<S>>,
>(config: {
  readonly name: Name
  readonly initialState: S
  readonly reducers: R
}) {
  const actionCreators = {} as Record<string, (...args: unknown[]) => unknown>
  const lookup: Record<string, (state: S, action: any) => S> = {}

  for (const key of Object.keys(config.reducers)) {
    const type = `${config.name}/${key}`
    const definition = config.reducers[key] as ReducerDefinition<S>

    if (typeof definition === 'function') {
      // Einfacher Reducer — Action Creator nimmt optionalen Payload
      actionCreators[key] = (payload?: unknown) =>
        payload !== undefined ? { type, payload } : { type }
      lookup[type] = definition as (state: S, action: any) => S
    } else {
      // { prepare, reducer } — Action Creator ruft prepare() auf
      actionCreators[key] = (...args: unknown[]) => ({
        type,
        ...definition.prepare(...args),
      })
      lookup[type] = definition.reducer
    }
  }

  const reducer = (state: S | undefined, action: { readonly type: string }): S => {
    if (state === undefined) return config.initialState
    const caseReducer = lookup[action.type]
    return caseReducer ? caseReducer(state, action) : state
  }

  return {
    actions: actionCreators as ActionCreators<Name, R>,
    reducer,
  }
}
