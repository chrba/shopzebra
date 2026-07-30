import { describe, expect, it } from 'vitest'
import { toLocalAction } from '@/app/sync/receive/toLocalAction'
import type { WireEvent } from '@/app/sync/receive/fetchEvents'
// Side-effect import: registers the listCreated action type used for the
// createdBy translation — same pattern as toOutboxEntry.test.ts.
import '@/features/lists/domain/listsSlice'

describe('toLocalAction', () => {
  const wireMeta = {
    eventId: 'e1',
    deviceId: 'other',
    userId: 'u2',
    position: '00000000000000000003',
  }

  it('marks events as remote so they are not sent back', () => {
    const event: WireEvent = {
      type: 'shopping/itemChecked',
      payload: { listId: 'l1', itemId: 'x' },
      meta: wireMeta,
    }
    expect(toLocalAction(event)).toEqual({
      type: 'shopping/itemChecked',
      payload: { listId: 'l1', itemId: 'x' },
      meta: { ...wireMeta, remote: true },
    })
  })

  it('translates createdBy back to ownerId for listCreated', () => {
    const event: WireEvent = {
      type: 'lists/listCreated',
      payload: { listId: 'l1', name: 'REWE', createdBy: 'u2' },
      meta: wireMeta,
    }
    expect(toLocalAction(event).payload).toEqual({
      listId: 'l1',
      name: 'REWE',
      ownerId: 'u2',
    })
  })
})
