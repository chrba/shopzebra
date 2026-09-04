// Policy edge of the receive path: a fetched server event becomes the
// confirmed event the withSync reducer folds.

import type { ConfirmedEvent } from '../withSync'
import type { WireEvent } from '../wire'

/**
 * Called by catch-up for every fetched event. meta.remote stops the echo:
 * the policy will not send it again and eventIdMiddleware keeps its identity.
 * The payload translation (createdBy → ownerId on opening events) comes from
 * the sync policy.
 */
export function toConfirmedEvent(
  event: WireEvent,
  domainPayloadOf: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>,
): ConfirmedEvent {
  return {
    type: event.type,
    payload: domainPayloadOf(event.type, event.payload),
    meta: { ...event.meta, remote: true },
  }
}
