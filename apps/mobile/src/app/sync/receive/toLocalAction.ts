// Policy edge of the receive path: turns a server event back into a
// local action.

import type { PayloadAction } from '../../createSlice'
import type { WireEvent } from './fetchEvents'

/**
 * Called by catch-up for every fetched event. meta.remote stops the echo:
 * the policy won't send it again, eventIdMiddleware keeps its identity.
 * The payload translation comes from the sync policy (createdBy → ownerId
 * on opening events).
 */
export function toLocalAction(
  event: WireEvent,
  domainPayloadOf: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>,
): PayloadAction<unknown> {
  return {
    type: event.type,
    payload: domainPayloadOf(event.type, event.payload),
    meta: { ...event.meta, remote: true },
  }
}
