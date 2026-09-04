// Custom createSlice — same API as RTK, but without Immer.
// Reducer functions MUST return new state (spread instead of mutation).

/**
 * The sync classification of an action, declared once at the reducer that
 * owns it (design: docs/superpowers/specs/2026-09-04-explicit-action-role-classification-design.md).
 *
 * - event: a real domain fact caused by a user action, part of the aggregate log
 * - command: event-shaped, but server-authoritative (class 2) — the server
 *   claims ownership and writes the event itself. Today this label only
 *   documents the special case in toOutboxEntry; the structural separation
 *   (dispatch through a dedicated thunk) is still outstanding.
 * - localEvent: a real domain fact whose distribution is deliberately limited
 *   to this device, because its authoritative version already reached the
 *   server through a command
 * - observation: a current value a query reported — no user action, no log entry
 * - hydration: restoring data this device already knew, from local storage
 */
export type ActionRole =
  | 'event'
  | 'command'
  | 'localEvent'
  | 'observation'
  | 'hydration'

export type ActionMeta = {
  /** Unique per dispatch. Used as part of the DynamoDB sort key for server-side idempotency. */
  readonly eventId: string
  /** Originating device. Used to filter out own events when syncing from the server. */
  readonly deviceId: string
  /** Set by fromServer() for events received from the backend. SyncMiddleware skips these. */
  readonly remote?: boolean
  /** Server-assigned log position — present only on events folded from the server. */
  readonly position?: string
  /** JWT-derived author — present only on events folded from the server. */
  readonly userId?: string
}

export type PayloadAction<P> = {
  readonly type: string
  readonly payload: P
  readonly meta?: ActionMeta
}

export function isPayloadAction(
  action: unknown,
): action is PayloadAction<unknown> {
  return typeof action === 'object' && action !== null && 'type' in action
}

// --- Reducer definition: plain function or { prepare, reducer } ---
//
// prepare is needed for non-deterministic values (IDs, timestamps, random).
// Reducers must be pure — same input, same output. Redux DevTools,
// Hot Reload and Strict Mode may call reducers multiple times with the same action.
// A crypto.randomUUID() inside a reducer would produce a different ID each time — broken.
// prepare runs BEFORE dispatch (only once), the result is fixed in the action payload.

type ReducerFunction<S> =
  | ((state: S) => S)
  | ((state: S, action: PayloadAction<any>) => S)

type ReducerWithPrepare<S> = {
  readonly prepare: (...args: any[]) => { readonly payload: any }
  readonly reducer: (state: S, action: PayloadAction<any>) => S
}

type ReducerDefinition<S> = ReducerFunction<S> | ReducerWithPrepare<S>

// A synced slice mixes categories — domain events, facts that stay local,
// query results — so the classification lives per reducer, not per slice.
// role is mandatory there: the overload below accepts no bare function.
type SyncedReducerDefinition<S> =
  | {
      readonly role: ActionRole
      readonly reducer: (state: S, action: PayloadAction<any>) => S
    }
  | {
      readonly role: ActionRole
      readonly prepare: (...args: any[]) => { readonly payload: any }
      readonly reducer: (state: S, action: PayloadAction<any>) => S
    }

// Maps a role-carrying definition back onto the shape the existing
// inference already understands, so none of it has to change.
type WithoutRole<R> = R extends {
  readonly role: ActionRole
  readonly prepare: infer P
  readonly reducer: infer F
}
  ? { readonly prepare: P; readonly reducer: F }
  : R extends { readonly role: ActionRole; readonly reducer: infer F }
    ? F
    : R

// --- Action Creator inference ---

type RawActionCreatorFromFunction<
  Name extends string,
  Key extends string,
  R,
> = R extends (...args: infer A) => any
  ? A extends [any, PayloadAction<infer P>]
    ? (payload: P) => { readonly type: `${Name}/${Key}`; readonly payload: P }
    : () => { readonly type: `${Name}/${Key}` }
  : never

type RawActionCreatorFromPrepare<
  Name extends string,
  Key extends string,
  R,
> = R extends {
  readonly prepare: (...args: infer A) => { readonly payload: infer P }
}
  ? (...args: A) => { readonly type: `${Name}/${Key}`; readonly payload: P }
  : never

type RawActionCreator<Name extends string, Key extends string, R> = R extends {
  readonly prepare: any
  readonly reducer: any
}
  ? RawActionCreatorFromPrepare<Name, Key, R>
  : RawActionCreatorFromFunction<Name, Key, R>

type InferPayload<R> = R extends {
  readonly prepare: (...args: any[]) => { readonly payload: infer P }
}
  ? P
  : R extends (...args: infer _A) => any
    ? _A extends [any, PayloadAction<infer P>]
      ? P
      : undefined
    : undefined

type ActionCreatorWithMeta<F, T extends string, P> = F & {
  readonly type: T
  readonly match: (action: {
    readonly type: string
    readonly payload?: unknown
  }) => action is PayloadAction<P>
}

type ActionCreators<Name extends string, R extends Record<string, any>> = {
  readonly [K in keyof R & string]: ActionCreatorWithMeta<
    RawActionCreator<Name, K, WithoutRole<R[K]>>,
    `${Name}/${K}`,
    InferPayload<WithoutRole<R[K]>>
  >
}

// --- Cross-slice reactions ---
//
// A slice can react to another slice's action (re-frame style broadcast):
// the owning slice dispatches, other slices fold the same action.
// Referencing the foreign action creator (not a raw type string) keeps
// the coupling visible and rename-safe.

type ExternalActionCreator = { readonly type: string }

type ExtraReducer<S> = {
  readonly creator: ExternalActionCreator
  readonly reducer: (state: S, action: PayloadAction<any>) => S
}

// --- Sync Policy ---
//
// The only sync policy: a slice opts in with `synced: true` and every
// action of that slice becomes a candidate for the outbox
// (sync-engine.md §3 — one boolean per slice, no per-action ifs).
const syncedSliceNames = new Set<string>()

/**
 * True when the slice owning this action type opted in with `synced: true`.
 * Purely structural: it says nothing about whether a concrete action must
 * be sent — that judgment (locality, aggregate id) lives in needsSync,
 * which calls this on every dispatch.
 */
export function belongsToSyncedSlice(type: string): boolean {
  const sliceName = type.split('/')[0]
  return sliceName !== undefined && syncedSliceNames.has(sliceName)
}

// --- Action role registry ---
//
// Filled only for reducers of a `synced: true` slice, each of which must
// declare a role (enforced by the overload below). needsSync reads this —
// the classification lives at the reducer, not in the payload's shape, and
// never has to travel with the action.
const roleByActionType = new Map<string, ActionRole>()

/** The declared role of an action type, or undefined outside any synced slice. */
export function roleOf(type: string): ActionRole | undefined {
  return roleByActionType.get(type)
}

// --- createSlice ---

// Note: this overload (synced?: false) is declared first — with the
// `synced: true` overload first, TypeScript's overload-failure recovery
// (interacting with noUncheckedIndexedAccess) widens every property of the
// resulting ActionCreators to `T | undefined`, which then poisons every
// other file importing an action creator from a slice that hasn't migrated
// to per-reducer roles yet. Declaration order alone avoids that; the
// intended "role is missing" error still surfaces at the call site.
export function createSlice<
  Name extends string,
  S,
  R extends Record<string, ReducerDefinition<S>>,
>(config: {
  readonly name: Name
  readonly initialState: S
  readonly reducers: R
  readonly extraReducers?: readonly ExtraReducer<S>[]
  readonly synced?: false
}): {
  readonly actions: ActionCreators<Name, R>
  readonly reducer: (state: S | undefined, action: { readonly type: string }) => S
}

export function createSlice<
  Name extends string,
  S,
  R extends Record<string, SyncedReducerDefinition<S>>,
>(config: {
  readonly name: Name
  readonly initialState: S
  readonly reducers: R
  readonly extraReducers?: readonly ExtraReducer<S>[]
  readonly synced: true
}): {
  readonly actions: ActionCreators<Name, R>
  readonly reducer: (state: S | undefined, action: { readonly type: string }) => S
}

export function createSlice(config: {
  readonly name: string
  readonly initialState: any
  readonly reducers: Record<string, any>
  readonly extraReducers?: readonly ExtraReducer<any>[]
  readonly synced?: boolean
}): {
  readonly actions: Record<string, any>
  readonly reducer: (state: any, action: { readonly type: string }) => any
} {
  if (config.synced) syncedSliceNames.add(config.name)

  const actionCreators = {} as Record<string, (...args: unknown[]) => unknown>
  const lookup: Record<string, (state: any, action: any) => any> = {}

  for (const key of Object.keys(config.reducers)) {
    const type = `${config.name}/${key}`
    const definition = config.reducers[key] as
      | ((state: any, action: any) => any)
      | {
          readonly role?: ActionRole
          readonly prepare?: (...args: unknown[]) => { readonly payload: unknown }
          readonly reducer: (state: any, action: any) => any
        }

    if (typeof definition === 'function') {
      const creator = (payload?: unknown) =>
        payload !== undefined ? { type, payload } : { type }
      creator.type = type
      creator.match = (action: { readonly type: string }): boolean =>
        action.type === type
      actionCreators[key] = creator
      lookup[type] = definition
      continue
    }

    const prepare = definition.prepare
    if (prepare) {
      const creator = (...args: unknown[]) => ({ type, ...prepare(...args) })
      creator.type = type
      creator.match = (action: { readonly type: string }): boolean =>
        action.type === type
      actionCreators[key] = creator
    } else {
      const creator = (payload?: unknown) =>
        payload !== undefined ? { type, payload } : { type }
      creator.type = type
      creator.match = (action: { readonly type: string }): boolean =>
        action.type === type
      actionCreators[key] = creator
    }
    lookup[type] = definition.reducer

    if (config.synced && definition.role !== undefined) {
      roleByActionType.set(type, definition.role)
    }
  }

  for (const external of config.extraReducers ?? []) {
    lookup[external.creator.type] = external.reducer
  }

  const reducer = (state: any, action: { readonly type: string }): any => {
    if (state === undefined) return config.initialState
    const caseReducer = lookup[action.type]
    return caseReducer ? caseReducer(state, action) : state
  }

  return {
    actions: actionCreators,
    reducer,
  }
}
