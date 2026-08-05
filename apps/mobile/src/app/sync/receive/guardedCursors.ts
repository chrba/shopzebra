import type { Aggregate } from '../aggregate'
import type { ReceiveLedger } from '../outbox'

/**
 * A ledger that only hands out cursors whose fold still exists.
 *
 * A cursor is a claim: "everything up to this position was folded into my
 * tree." Once that tree is gone — the aggregate was left, the owner
 * removed us and we were added again, storage was cleared in part — the
 * claim is false. Resuming behind it would ask the server for events
 * *after* the position, so the event that builds the aggregate in the
 * first place never arrives again and the screen stays empty for good.
 *
 * Rather than clearing the cursor at every place that may drop an
 * aggregate — a rule somebody eventually forgets — the check happens where
 * the cursor is read. There is exactly one such place, and it cannot be
 * bypassed.
 *
 * Starting over is safe: folding a log twice yields the same tree
 * (reducer totality, architecture/sync-engine.md §5).
 *
 * @param ledger The real ledger, usually the outbox.
 * @param holdsFoldedStateFor Whether this device still holds that
 *   aggregate's folded state. Not a permission question — what the caller
 *   may see is what fetchAggregates answers.
 */
export function cursorsGuardedByFoldedState(
  ledger: ReceiveLedger,
  holdsFoldedStateFor: (aggregate: Aggregate) => boolean,
): ReceiveLedger {
  return {
    cursorFor: (aggregate) =>
      holdsFoldedStateFor(aggregate) ? ledger.cursorFor(aggregate) : null,
    advanceCursor: (aggregate, position) =>
      ledger.advanceCursor(aggregate, position),
  }
}
