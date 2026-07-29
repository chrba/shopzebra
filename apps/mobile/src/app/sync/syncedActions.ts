// Policy edge of the engine: which dispatched actions enter the outbox
// (and as what), and how server events become local actions again.
// The class-2 exception list is intentionally tiny and explicit
// (sync-engine.md §6) — everything else rides the generic path.

import {
  isSyncedActionType,
  type ActionMeta,
  type PayloadAction,
} from '../createSlice'
import { listCreated } from '../../features/lists/domain/listsSlice'
import type { OutboxEntry } from './outbox'
import type { WireEvent } from './transport'

function aggregateListId(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object') return null
  const value = (payload as { readonly listId?: unknown }).listId
  return typeof value === 'string' ? value : null
}

export function toOutboxEntry(
  action: PayloadAction<unknown>,
): OutboxEntry | null {
  if (action.meta?.remote) return null

  // Class-2 command: the server claims ownership and writes the event
  // itself — the wire names the creator `createdBy` (services/events.md).
  if (listCreated.match(action)) {
    const { listId, name, ownerId } = action.payload
    return {
      kind: 'command',
      path: '/lists',
      wire: {
        type: listCreated.type,
        payload: { listId, name, createdBy: ownerId },
        meta: action.meta as ActionMeta,
      },
    }
  }

  if (!isSyncedActionType(action.type)) return null
  const listId = aggregateListId(action.payload)
  if (!listId) return null
  return { kind: 'event', listId, action }
}

export function toLocalAction(event: WireEvent): PayloadAction<unknown> {
  const payload =
    event.type === listCreated.type
      ? translateCreatedBy(event.payload)
      : event.payload
  // remote: true — syncMiddleware must not post it back and
  // eventIdMiddleware must keep the original identity.
  return { type: event.type, payload, meta: { ...event.meta, remote: true } }
}

function translateCreatedBy(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const { createdBy, ...rest } = payload
  return { ...rest, ownerId: createdBy }
}
