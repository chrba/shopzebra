// Opening events cross the wire with `createdBy` where the domain says
// `ownerId` (services/events.md). Both directions live here as a pair —
// whoever changes one sees the other. Which events that applies to is the
// sync policy's knowledge (`opens` in the slice declaration), not this file's.

/** Domain → wire. Called by the sync policy when queueing an opening event. */
export function ownerIdToCreatedBy(
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { ownerId, ...rest } = payload
  return { ...rest, createdBy: ownerId }
}

/** Wire → domain. Called by the sync policy when folding a fetched opening event. */
export function createdByToOwnerId(
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { createdBy, ...rest } = payload
  return { ...rest, ownerId: createdBy }
}
