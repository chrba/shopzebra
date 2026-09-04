// The sync-membership predicate, shared by the send path (what enters the
// outbox) and by withSync (what enters the pending queue). One source of
// truth — the two must never disagree.
//
// Reads the role declared at the reducer (createSlice.ts). No payload
// inspection: which aggregate an event belongs to is a routing question and
// stays in toOutboxEntry
// (design: docs/superpowers/specs/2026-09-04-explicit-action-role-classification-design.md).

import { roleOf, type ActionRole, type PayloadAction } from '../createSlice'

/**
 * Which roles travel to the server. A table rather than a condition: the
 * three roles that stay local say so out loud, and a sixth role cannot be
 * added without deciding this here — the type demands the entry.
 */
const REACHES_SERVER: Readonly<Record<ActionRole, boolean>> = {
  event: true,
  command: true,
  localEvent: false,
  observation: false,
  hydration: false,
}

/**
 * True for own actions that must reach the server. Excludes server echoes
 * (meta.remote), the roles that stay on this device, and anything outside a
 * synced slice. Called on every dispatch, by toOutboxEntry and by withSync.
 */
export function needsSync(action: PayloadAction<unknown>): boolean {
  if (!action.meta || action.meta.remote) return false
  const role = roleOf(action.type)
  return role !== undefined && REACHES_SERVER[role]
}
