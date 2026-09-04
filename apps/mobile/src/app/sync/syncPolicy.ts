// The one place that knows what an action means to sync: whether it leaves
// the device (its role) and where it goes (the aggregate it is on or opens).
// Composed once from the declarations of every synced slice; withSync, the
// engine and the receive path only consume it
// (design: docs/superpowers/specs/2026-09-04-sync-declaration-design.md).

import type {
  ActionDeclaration,
  ActionRole,
  PayloadAction,
  SyncDeclarations,
} from '../createSlice'
import { collectionPathFor, eventsPathFor, idFieldOf } from './aggregate'
import type { OutboxEntry } from './outbox'
import { createdByToOwnerId, ownerIdToCreatedBy } from './wire'

export type SyncPolicy = {
  /** True for own domain events — they wait in pending. Called by withSync on every dispatch. */
  readonly reachesServer: (action: PayloadAction<unknown>) => boolean
  /** The queued send for an action, or null when it stays on the device. Called by SyncEngine.record. */
  readonly toOutboxEntry: (action: PayloadAction<unknown>) => OutboxEntry | null
  /** Wire → domain for one fetched payload (createdBy → ownerId on opening events). Called by catch-up. */
  readonly domainPayloadOf: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>
  /** Wire → domain for a whole queued action. Called once at engine start for pendingRestored. */
  readonly domainActionOf: (wire: PayloadAction<unknown>) => PayloadAction<unknown>
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

function opensAggregate(declaration: ActionDeclaration): boolean {
  return 'opens' in declaration
}

function routeOf(
  declaration: ActionDeclaration,
  action: PayloadAction<unknown>,
): OutboxEntry | null {
  if (!isRecord(action.payload)) return null
  if ('opens' in declaration) {
    return {
      path: collectionPathFor(declaration.opens),
      wire: { ...action, payload: ownerIdToCreatedBy(action.payload) },
    }
  }
  if ('on' in declaration) {
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

  const reachesServer = (action: PayloadAction<unknown>): boolean => {
    if (!action.meta || action.meta.remote) return false
    const declaration = declarations.get(action.type)
    return declaration !== undefined && REACHES_SERVER[declaration.role]
  }

  const domainPayloadOf = (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> => {
    const declaration = declarations.get(type)
    return declaration && opensAggregate(declaration)
      ? createdByToOwnerId(payload)
      : { ...payload }
  }

  return {
    reachesServer,
    toOutboxEntry: (action) => {
      if (!reachesServer(action)) return null
      const declaration = declarations.get(action.type)
      return declaration ? routeOf(declaration, action) : null
    },
    domainPayloadOf,
    domainActionOf: (wire) => {
      const declaration = declarations.get(wire.type)
      if (!declaration || !opensAggregate(declaration) || !isRecord(wire.payload)) {
        return wire
      }
      return { ...wire, payload: createdByToOwnerId(wire.payload) }
    },
  }
}
