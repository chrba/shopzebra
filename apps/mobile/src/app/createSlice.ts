// Custom createSlice — same API as RTK, but without Immer.
// Reducer functions MUST return new state (spread instead of mutation).

import type { AggregateKind } from './sync/aggregate'

/**
 * How a synced slice classifies one of its actions
 * (design: docs/superpowers/specs/2026-09-04-sync-declaration-design.md).
 *
 * - event: a domain fact. `on` names the aggregate whose log it is
 *   appended to; `opens` names the kind of aggregate it brings into being —
 *   no log exists yet, so it goes to the collection endpoint, where the
 *   server bootstraps ownership. Both travel to the server.
 * - localEvent: a domain fact whose reach is deliberately this device only
 * - observation: a current value a query reported — no user action, no log entry
 * - hydration: restoring data this device already knew, from local storage
 */
export type ActionDeclaration =
  | { readonly role: 'event'; readonly on: AggregateKind }
  | { readonly role: 'event'; readonly opens: AggregateKind }
  | { readonly role: 'localEvent' }
  | { readonly role: 'observation' }
  | { readonly role: 'hydration' }

export type ActionRole = ActionDeclaration['role']

/** Every declaration of a synced slice, keyed by full action type (`lists/listRenamed`). */
export type SyncDeclarations = Readonly<Record<string, ActionDeclaration>>

export type ActionMeta = {
  /** Unique per dispatch. Used as part of the DynamoDB sort key for server-side idempotency. */
  readonly eventId: string
  /** Originating device. Used to filter out own events when syncing from the server. */
  readonly deviceId: string
  /** Set by the receive path for events folded from the server. They are never sent back. */
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
// The declaration is mandatory there: the overload below accepts no bare
// function, and an event must say which aggregate it is on or opens.
type SyncedReducerDefinition<S> = ActionDeclaration &
  (
    | { readonly reducer: (state: S, action: PayloadAction<any>) => S }
    | {
        readonly prepare: (...args: any[]) => { readonly payload: any }
        readonly reducer: (state: S, action: PayloadAction<any>) => S
      }
  )

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

// --- Event payloads must name their aggregate ---
//
// The route of an event is built from the id field of its aggregate. The
// compiler checks the field is there, so no event can ever be admitted for
// sending and then turn out unroutable.

/** Mirrors ID_FIELD_OF in sync/aggregate.ts — the two must agree. */
type AggregateIdField<K extends AggregateKind> = K extends 'list'
  ? 'listId'
  : K extends 'recipe'
    ? 'recipeId'
    : 'planId'

type AggregateOf<D> = D extends { readonly on: infer K extends AggregateKind }
  ? K
  : D extends { readonly opens: infer K extends AggregateKind }
    ? K
    : never

type NamesItsAggregate<D> = [AggregateOf<D>] extends [never]
  ? D
  : InferPayload<WithoutRole<D>> extends {
        readonly [F in AggregateIdField<AggregateOf<D>>]: string
      }
    ? D
    : {
        readonly reducer: `an event on/opens '${AggregateOf<D>}' must take a payload with a string ${AggregateIdField<AggregateOf<D>>}`
      }

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
// A slice opts in with `synced: true` (one boolean per slice, no per-slice
// ifs); every reducer of that slice then declares its own role, and
// needsSync reads that role — no per-action ifs either (sync-engine.md §3).
const syncedSliceNames = new Set<string>()

/**
 * True when the slice owning this action type opted in with `synced: true`.
 * Purely structural: slice membership only, nothing about whether this
 * concrete action reaches the server. That decision is needsSync reading
 * the declared role via `roleOf()` — this function is not part of it.
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

// This overload (synced?: false) is declared first. Verified experimentally
// (task 5): with a reducer missing its role, both orders report the same
// specific diagnostic at the slice itself (TS matches the `synced: true`
// overload for the message either way, since the literal discriminant
// picks it out) — so order does not improve that message. But whichever
// overload is declared second still triggers TypeScript's overload-failure
// recovery once the call fails both, and that recovery widens every
// property of the resulting ActionCreators to `T | undefined`, poisoning
// every other file that imports an action creator from the affected slice.
// Swapping the order only changes which files get poisoned, not whether
// they do (measured: 33 files either way). Keeping `synced?: false` first
// is arbitrary between two equally bad options, so it stays as documented
// history rather than a deliberate optimization — see task-5-report.md for
// the measurements.
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
  readonly declarations: SyncDeclarations
}

export function createSlice<
  Name extends string,
  S,
  R extends Record<string, SyncedReducerDefinition<S>> & {
    readonly [K in keyof R]: NamesItsAggregate<R[K]>
  },
>(config: {
  readonly name: Name
  readonly initialState: S
  readonly reducers: R
  readonly extraReducers?: readonly ExtraReducer<S>[]
  readonly synced: true
}): {
  readonly actions: ActionCreators<Name, R>
  readonly reducer: (state: S | undefined, action: { readonly type: string }) => S
  readonly declarations: SyncDeclarations
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
  readonly declarations: SyncDeclarations
} {
  if (config.synced) syncedSliceNames.add(config.name)

  const actionCreators = {} as Record<string, (...args: unknown[]) => unknown>
  const lookup: Record<string, (state: any, action: any) => any> = {}
  const declarations: Record<string, ActionDeclaration> = {}

  for (const key of Object.keys(config.reducers)) {
    const type = `${config.name}/${key}`
    const definition = config.reducers[key] as
      | ((state: any, action: any) => any)
      | (ActionDeclaration & {
          readonly prepare?: (...args: unknown[]) => { readonly payload: unknown }
          readonly reducer: (state: any, action: any) => any
        })

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

    const { prepare, reducer: caseReducer, ...declaration } = definition
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
    lookup[type] = caseReducer

    if (config.synced) {
      declarations[type] = declaration
      roleByActionType.set(type, declaration.role)
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
    declarations,
  }
}
