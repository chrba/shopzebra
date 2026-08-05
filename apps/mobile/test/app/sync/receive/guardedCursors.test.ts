import { describe, expect, test } from 'vitest'
import { cursorsGuardedByFoldedState } from '@/app/sync/receive/guardedCursors'
import type { Aggregate } from '@/app/sync/aggregate'
import type { ReceiveLedger } from '@/app/sync/outbox'

const known = { kind: 'list', id: 'kept' } as const
const forgotten = { kind: 'list', id: 'left' } as const

/** A ledger that remembers a position for every aggregate it is asked about. */
function ledgerAt(position: string): ReceiveLedger & { advanced: string[] } {
  const advanced: string[] = []
  return {
    advanced,
    cursorFor: () => position,
    advanceCursor: (aggregate: Aggregate, to: string) => {
      advanced.push(`${aggregate.id}@${to}`)
      return Promise.resolve()
    },
  }
}

const holdsOnly =
  (kept: string) =>
  (aggregate: Aggregate): boolean =>
    aggregate.id === kept

describe('cursors guarded by the folded state', () => {
  // The bug this exists for: leaving a list drops its tree but keeps the
  // cursor. Being added again then resumes behind the listCreated, which
  // never arrives a second time — the list stays invisible for good.
  test('withholds the cursor of an aggregate this device no longer holds', () => {
    const guarded = cursorsGuardedByFoldedState(
      ledgerAt('500'),
      holdsOnly('kept'),
    )

    expect(guarded.cursorFor(forgotten)).toBeNull()
  })

  test('passes the cursor through while the fold is still there', () => {
    const guarded = cursorsGuardedByFoldedState(
      ledgerAt('500'),
      holdsOnly('kept'),
    )

    expect(guarded.cursorFor(known)).toBe('500')
  })

  // Writing back is never in question: whatever was folded happened, and
  // the position has to be kept or the same events arrive forever.
  test('lets every advance through, held or not', async () => {
    const ledger = ledgerAt('500')
    const guarded = cursorsGuardedByFoldedState(ledger, holdsOnly('kept'))

    await guarded.advanceCursor(forgotten, '900')

    expect(ledger.advanced).toEqual(['left@900'])
  })
})
