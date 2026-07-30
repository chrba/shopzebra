// The engine's server interface: send path + receive path in one object.
// The implementations live with their paths (send/sendEntry, receive/fetchEvents).

import type { OutboxEntry } from './outbox'
import { sendEntry, type SendResult } from './send/sendEntry'
import {
  fetchEventsSince,
  fetchListIds,
  type WireEvent,
} from './receive/fetchEvents'

export type { SendResult } from './send/sendEntry'
export type { WireEvent } from './receive/fetchEvents'

/** The engine's view of the server: send one entry, list aggregates, pull deltas. */
export type Transport = {
  /** POSTs one outbox entry to its path and classifies the response: confirmed (2xx), retry (network/5xx), rejected (4xx). Never throws. */
  readonly sendEntry: (entry: OutboxEntry) => Promise<SendResult>
  /** Aggregates the caller may sync (membership projection) — the catch-up fan-out. Throws on failure. */
  readonly fetchListIds: () => Promise<readonly string[]>
  /** Events of one aggregate after `since` (whole log when null), in wire format. Throws on failure. */
  readonly fetchEventsSince: (
    aggregateId: string,
    since: string | null,
  ) => Promise<readonly WireEvent[]>
}

/** The real HTTP transport — wired into the engine singleton (syncEngine.ts). */
export const httpTransport: Transport = {
  sendEntry,
  fetchListIds,
  fetchEventsSince,
}
