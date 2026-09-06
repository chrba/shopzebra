// The engine's server interface: send path + receive path in one object.
// The implementations live with their paths (send/sendEntry, receive/fetchEvents).

import type { Aggregate } from './aggregate'
import type { OutboxEntry } from './outbox'
import { sendEntry, type SendResult } from './send/sendEntry'
import {
  fetchAggregates,
  fetchEventsSince,
  listCollections,
  type CollectionListing,
} from './receive/fetchEvents'
import type { WireEvent } from './wire'

export type { SendResult } from './send/sendEntry'
export type { WireEvent } from './wire'
export type { CollectionListing } from './receive/fetchEvents'

/** The engine's view of the server: send one entry, list aggregates, pull deltas. */
export type Transport = {
  /** POSTs one outbox entry to its path and classifies the response: confirmed (2xx), retry (network/5xx), rejected (4xx). Never throws. */
  readonly sendEntry: (entry: OutboxEntry) => Promise<SendResult>
  /** Aggregates the caller may sync, of every kind (membership projection) — the catch-up fan-out. Throws on failure. */
  readonly fetchAggregates: () => Promise<readonly Aggregate[]>
  /**
   * The same answer, but per collection and only for the collections that
   * could be read. The engine lets go of what a collection does not name,
   * so it needs to tell "you are a member of none" from "I could not ask".
   *
   * Optional because a transport may not distinguish the two — a fake that
   * always succeeds has nothing to add. Such a transport is taken at its
   * word: everything it returned is everything every collection named.
   */
  readonly listCollections?: () => Promise<readonly CollectionListing[]>
  /** Events of one aggregate after `since` (whole log when null), in wire format. Throws on failure. */
  readonly fetchEventsSince: (
    aggregate: Aggregate,
    since: string | null,
  ) => Promise<readonly WireEvent[]>
}

/** The real HTTP transport — wired into the engine singleton (syncEngine.ts). */
export const httpTransport: Transport = {
  sendEntry,
  fetchAggregates,
  listCollections,
  fetchEventsSince,
}
