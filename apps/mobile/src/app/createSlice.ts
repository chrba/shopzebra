// Custom createSlice — same API as RTK, but without Immer.
// Reducer functions MUST return new state (spread instead of mutation).

export type PayloadAction<P> = {
  readonly type: string
  readonly payload: P
}

// --- Reducer definition: plain function or { prepare, reducer } ---
//
// prepare is needed for non-deterministic values (IDs, timestamps, random).
// Reducers must be pure — same input, same output. Redux DevTools,
// Hot Reload and Strict Mode may call reducers multiple times with the same action.
// A crypto.randomUUID() inside a reducer would produce a different ID each time — broken.
// prepare runs BEFORE dispatch (only once), the result is fixed in the action payload.

type ReducerFunction<S> = ((state: S) => S) | ((state: S, action: PayloadAction<any>) => S)

type ReducerWithPrepare<S> = {
  readonly prepare: (...args: any[]) => { readonly payload: any }
  readonly reducer: (state: S, action: PayloadAction<any>) => S
}

type ReducerDefinition<S> = ReducerFunction<S> | ReducerWithPrepare<S>

// --- Action Creator inference ---

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
      // Plain reducer — action creator takes optional payload
      actionCreators[key] = (payload?: unknown) =>
        payload !== undefined ? { type, payload } : { type }
      lookup[type] = definition as (state: S, action: any) => S
    } else {
      // { prepare, reducer } — action creator calls prepare()
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
