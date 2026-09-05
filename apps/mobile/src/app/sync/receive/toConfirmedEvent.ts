// Policy edge of the receive path: a fetched server event becomes the
// confirmed event the withSync reducer folds.

import type { PayloadAction } from '../../createSlice'
import type { ConfirmedEvent } from '../withSync'
import type { WireEvent } from '../wire'

/**
 * Called by catch-up for every fetched event. meta.remote stops the echo:
 * the policy will not send it again and eventIdMiddleware keeps its identity.
 * A wire event is an action in wire form, so the policy's wire → domain
 * translation (createdBy → ownerId on opening events) applies as is.
 */
export function toConfirmedEvent(
  event: WireEvent,
  domainActionOf: (wire: PayloadAction<unknown>) => PayloadAction<unknown>,
): ConfirmedEvent {
  const local = domainActionOf(event)
  return {
    type: local.type,
    payload: local.payload,
    meta: { ...event.meta, remote: true },
  }
}
