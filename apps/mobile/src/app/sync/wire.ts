// Creation events cross the wire with `createdBy` where the domain says
// `ownerId` (services/events.md). Both directions live here as a pair —
// whoever changes one sees the other. A new ownable aggregate adds its
// creation event to the list below and needs nothing else.

import type { PayloadAction } from '../createSlice'
import { listCreated } from '../../features/lists/domain/listsSlice'
import { recipeCreated } from '../../features/recipes/domain/recipesSlice'

/** The events that name their creator differently on the wire. */
const CREATION_EVENTS: readonly string[] = [listCreated.type, recipeCreated.type]

function namesTheCreator(type: string): boolean {
  return CREATION_EVENTS.includes(type)
}

/** Domain → wire. Called by toOutboxEntry when queueing a create command. */
export function ownerIdToCreatedBy(
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { ownerId, ...rest } = payload
  return { ...rest, createdBy: ownerId }
}

/** Wire → domain. Called by toLocalAction when folding a fetched creation. */
export function createdByToOwnerId(
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { createdBy, ...rest } = payload
  return { ...rest, ownerId: createdBy }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Wire → domain for a fetched event, or the payload unchanged. */
export function domainPayloadOf(
  type: string,
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return namesTheCreator(type) ? createdByToOwnerId(payload) : { ...payload }
}

/**
 * Wire → domain for a whole queued action: undoes the creation rename,
 * leaves everything else untouched. Called once at engine start when the
 * reducer's pending queue is rebuilt from the persisted outbox queue.
 */
export function domainActionOf(
  wire: PayloadAction<unknown>,
): PayloadAction<unknown> {
  if (!namesTheCreator(wire.type) || !isRecord(wire.payload)) return wire
  return { ...wire, payload: createdByToOwnerId(wire.payload) }
}
