// listCreated crosses the wire as `createdBy` where the domain says `ownerId`
// (services/events.md). Both directions live here as a pair — whoever
// changes one sees the other.

import type { PayloadAction } from '../createSlice'
import { listCreated } from '../../features/lists/domain/listsSlice'

/** Domain → wire. Called by toOutboxEntry when queueing the create-list command. */
export function ownerIdToCreatedBy(payload: {
  readonly listId: string
  readonly name: string
  readonly ownerId: string
}): Record<string, unknown> {
  const { ownerId, ...rest } = payload
  return { ...rest, createdBy: ownerId }
}

/** Wire → domain. Called by toLocalAction when folding a fetched listCreated. */
export function createdByToOwnerId(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const { createdBy, ...rest } = payload
  return { ...rest, ownerId: createdBy }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Wire → domain for a whole queued action: undoes the listCreated rename,
 * leaves everything else untouched. Called once at engine start when the
 * reducer's pending queue is rebuilt from the persisted outbox queue.
 */
export function domainActionOf(
  wire: PayloadAction<unknown>,
): PayloadAction<unknown> {
  if (wire.type !== listCreated.type || !isRecord(wire.payload)) return wire
  return { ...wire, payload: createdByToOwnerId(wire.payload) }
}
