// Policy edge of the receive path: turns a server event back into a
// local action.

import type { PayloadAction } from '../../createSlice'
import { domainPayloadOf } from '../wire'
import type { WireEvent } from './fetchEvents'

/**
 * Called by catch-up for every fetched event. meta.remote stops the echo:
 * syncMiddleware won't re-send it, eventIdMiddleware keeps its identity.
 */
export function toLocalAction(event: WireEvent): PayloadAction<unknown> {
  return {
    type: event.type,
    payload: domainPayloadOf(event.type, event.payload),
    meta: { ...event.meta, remote: true },
  }
}
