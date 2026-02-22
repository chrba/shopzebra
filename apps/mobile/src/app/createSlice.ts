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

type RawActionCreatorFromFunction<Name extends string, Key extends string, R> =
  R extends (...args: infer A) => any
    ? A extends [any, PayloadAction<infer P>]
      ? (payload: P) => { readonly type: `${Name}/${Key}`; readonly payload: P }
      : () => { readonly type: `${Name}/${Key}` }
    : never

type RawActionCreatorFromPrepare<Name extends string, Key extends string, R> =
  R extends { readonly prepare: (...args: infer A) => { readonly payload: infer P } }
    ? (...args: A) => { readonly type: `${Name}/${Key}`; readonly payload: P }
    : never

type RawActionCreator<Name extends string, Key extends string, R> =
  R extends { readonly prepare: any; readonly reducer: any }
    ? RawActionCreatorFromPrepare<Name, Key, R>
    : RawActionCreatorFromFunction<Name, Key, R>

type InferPayload<R> =
  R extends { readonly prepare: (...args: any[]) => { readonly payload: infer P } }
    ? P
    : R extends (...args: infer _A) => any
      ? _A extends [any, PayloadAction<infer P>] ? P : undefined
      : undefined

type ActionCreatorWithMeta<F, T extends string, P> = F & {
  readonly type: T
  readonly match: (action: { readonly type: string; readonly payload?: unknown }) => action is PayloadAction<P>
}

type ActionCreators<Name extends string, R extends Record<string, any>> = {
  readonly [K in keyof R & string]: ActionCreatorWithMeta<
    RawActionCreator<Name, K, R[K]>,
    `${Name}/${K}`,
    InferPayload<R[K]>
  >
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
      const creator = (payload?: unknown) =>
        payload !== undefined ? { type, payload } : { type }
      creator.type = type
      creator.match = (action: { readonly type: string }): boolean =>
        action.type === type
      actionCreators[key] = creator
      lookup[type] = definition as (state: S, action: any) => S
    } else {
      // { prepare, reducer } — action creator calls prepare()
      const creator = (...args: unknown[]) => ({
        type,
        ...definition.prepare(...args),
      })
      creator.type = type
      creator.match = (action: { readonly type: string }): boolean =>
        action.type === type
      actionCreators[key] = creator
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
