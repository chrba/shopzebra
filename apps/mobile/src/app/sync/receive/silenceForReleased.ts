// Read-side guard for whole aggregates: nothing is pulled for something this device let go of.
import type { Aggregate } from '../aggregate'
import type { WireEvent } from '../wire'

type EventSource = (
  aggregate: Aggregate,
  since: string | null,
) => Promise<readonly WireEvent[]>

/**
 * An event source that says nothing about aggregates this device released.
 * Called by SyncEngine.syncOnce, which wraps the transport before handing
 * it to catchUp.
 *
 * Leaving a list is not an event of that list — whatever ended the
 * membership ended the access to its log — so `confirmed`, which is the
 * fold of the log, cannot hold the fact. Pull the log again and the list is
 * back: `listCreated` folds a second time and the tile returns, which is
 * what "leaving does nothing" looks like from the outside.
 *
 * The collection keeps naming the aggregate for a while after the server
 * accepted the removal — its membership projection is a secondary index —
 * and it names a deleted list forever, because deleting does not touch
 * membership. So the collection cannot be the answer either. The release is.
 *
 * Nothing is lost by staying silent: the release is settled the moment the
 * collection stops naming the aggregate, and a new invitation then pulls its
 * log from the start (SyncEngine.settleReleases).
 *
 * @param fetchEventsSince The real source, usually the HTTP transport.
 * @param hasReleased Whether this device let go of that aggregate.
 */
export function silenceForReleasedAggregates(
  fetchEventsSince: EventSource,
  hasReleased: (aggregate: Aggregate) => boolean,
): EventSource {
  return (aggregate, since) =>
    hasReleased(aggregate)
      ? Promise.resolve([])
      : fetchEventsSince(aggregate, since)
}
