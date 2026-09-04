import { describe, expect, it } from 'vitest'
import { toConfirmedEvent } from '@/app/sync/receive/toConfirmedEvent'
import type { WireEvent } from '@/app/sync/wire'
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'

describe('toConfirmedEvent', () => {
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
    expect(toConfirmedEvent(event, appSyncPolicy.domainPayloadOf)).toEqual({
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
    expect(
      toConfirmedEvent(event, appSyncPolicy.domainPayloadOf).payload,
    ).toEqual({
      listId: 'l1',
      name: 'REWE',
      ownerId: 'u2',
    })
  })
})
