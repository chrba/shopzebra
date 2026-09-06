// The one place that knows what an action means to sync — whether it leaves
// the device (its role), where it goes (the log it is `on` or `opens`) and
// what it lets go of (`releases`) — plus the reverse for anything coming
// back. Composed once from the declarations of every synced slice; withSync,
// the engine and the receive path only consume it. Nothing here inspects an
// action's name or payload shape: every answer comes from the declaration at
// its reducer.

import type {
  ActionDeclaration,
  ActionRole,
  PayloadAction,
  SyncDeclarations,
} from '../createSlice'
import {
  collectionPathFor,
  eventsPathFor,
  idFieldOf,
  type Aggregate,
  type AggregateKind,
} from './aggregate'
import type { OutboxEntry } from './outbox'
import { createdByToOwnerId, ownerIdToCreatedBy } from './wire'

export type SyncPolicy = {
  /**
   * Does this action leave the device? Called by withSync on every dispatch:
   * true → optimistic in `visible`, waiting in `pending`; false → folded into
   * both trees. Only `role: 'event'` travels; own action, never a server echo.
   */
  readonly reachesServer: (action: PayloadAction<unknown>) => boolean

  /**
   * Where does it go? Called by SyncEngine.offer for every dispatch.
   *
   *   itemChecked({ listId: 'abc', … })     → { path: '/lists/abc/events', wire: action }
   *   listCreated({ …, ownerId: 'u1' })     → { path: '/lists', wire: … createdBy: 'u1' }
   *   listDropped({ listId: 'abc' })        → null (stays here)
   */
  readonly toOutboxEntry: (action: PayloadAction<unknown>) => OutboxEntry | null

  /**
   * Wire → domain: the wire says `createdBy`, the domain says `ownerId`, and
   * only opening events carry the field. Called for every event the catch-up
   * fetched from the server, and at engine start for every entry still in
   * the outbox (it stores what was sent, so in wire form) — a list created
   * offline lives only there until the server confirms it, and would come
   * back without an owner. Returns the same reference when nothing changes.
   *
   *   { type: 'lists/listCreated', payload: { …, createdBy: 'u1' } }
   *     → { type: 'lists/listCreated', payload: { …, ownerId: 'u1' } }
   *   { type: 'shopping/itemChecked', … }  → unchanged
   */
  readonly domainActionOf: (
    wire: PayloadAction<unknown>,
  ) => PayloadAction<unknown>

  /**
   * What does this device let go of? Called by SyncEngine.offer for every
   * dispatch; null for everything but the few actions declaring `releases`.
   *
   *   listDropped({ listId: 'abc' })    → { kind: 'list', id: 'abc' }
   *   listRenamed({ listId: 'abc' })    → null (we keep it)
   *
   * The receive path needs the answer because no event carries it:
   * `confirmed` is the fold of the log, so a drop folded into it lasts
   * exactly until that log is folded again.
   */
  readonly releasedAggregateOf: (
    action: PayloadAction<unknown>,
  ) => Aggregate | null
}

/**
 * Which roles travel to the server. A table rather than a condition: the
 * three roles that stay local say so out loud, and a new role cannot be
 * added without deciding this here — the type demands the entry.
 */
const REACHES_SERVER: Readonly<Record<ActionRole, boolean>> = {
  event: true,
  localEvent: false,
  observation: false,
  hydration: false,
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

type OpeningDeclaration = Extract<
  ActionDeclaration,
  { readonly opens: AggregateKind }
>
type AppendingDeclaration = Extract<
  ActionDeclaration,
  { readonly on: AggregateKind }
>
type ReleasingDeclaration = Extract<
  ActionDeclaration,
  { readonly releases: AggregateKind }
>

function releasesAggregate(
  declaration: ActionDeclaration,
): declaration is ReleasingDeclaration {
  return 'releases' in declaration
}

function opensAggregate(
  declaration: ActionDeclaration,
): declaration is OpeningDeclaration {
  return 'opens' in declaration
}

function appendsToAggregate(
  declaration: ActionDeclaration,
): declaration is AppendingDeclaration {
  return 'on' in declaration
}

function routeOf(
  declaration: ActionDeclaration,
  action: PayloadAction<unknown>,
): OutboxEntry | null {
  if (!isRecord(action.payload)) return null
  if (opensAggregate(declaration)) {
    return {
      path: collectionPathFor(declaration.opens),
      wire: { ...action, payload: ownerIdToCreatedBy(action.payload) },
    }
  }
  if (appendsToAggregate(declaration)) {
    // The compiler already made the field mandatory; this only narrows unknown.
    const id = action.payload[idFieldOf(declaration.on)]
    if (typeof id !== 'string') return null
    return { path: eventsPathFor({ kind: declaration.on, id }), wire: action }
  }
  return null
}

/** Builds the app's policy from the declarations of its synced slices. Called once, in appSyncPolicy.ts. */
export function composeSyncPolicy(
  ...declarationSets: readonly SyncDeclarations[]
): SyncPolicy {
  const declarations = new Map<string, ActionDeclaration>()
  for (const set of declarationSets) {
    for (const [type, declaration] of Object.entries(set)) {
      if (declarations.has(type)) {
        throw new Error(`sync: ${type} is declared by more than one slice`)
      }
      declarations.set(type, declaration)
    }
  }

  const isOwnAction = (action: PayloadAction<unknown>): boolean =>
    action.meta !== undefined && !action.meta.remote

  const reachesServer = (action: PayloadAction<unknown>): boolean => {
    if (!isOwnAction(action)) return false
    const declaration = declarations.get(action.type)
    return declaration !== undefined && REACHES_SERVER[declaration.role]
  }

  return {
    reachesServer,
    toOutboxEntry: (action) => {
      if (!isOwnAction(action)) return null
      const declaration = declarations.get(action.type)
      if (!declaration || !REACHES_SERVER[declaration.role]) return null
      return routeOf(declaration, action)
    },
    releasedAggregateOf: (action) => {
      const declaration = declarations.get(action.type)
      if (
        !declaration ||
        !releasesAggregate(declaration) ||
        !isRecord(action.payload)
      ) {
        return null
      }
      // The compiler already made the field mandatory; this only narrows unknown.
      const id = action.payload[idFieldOf(declaration.releases)]
      return typeof id === 'string' ? { kind: declaration.releases, id } : null
    },
    domainActionOf: (wire) => {
      const declaration = declarations.get(wire.type)
      if (
        !declaration ||
        !opensAggregate(declaration) ||
        !isRecord(wire.payload)
      ) {
        return wire
      }
      return { ...wire, payload: createdByToOwnerId(wire.payload) }
    },
  }
}
