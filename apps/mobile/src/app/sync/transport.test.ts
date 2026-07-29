import { describe, expect, it } from 'vitest'
import type { OutboxEntry } from './outbox'
import {
  fetchEventsSince,
  fetchListIds,
  sendEntry,
  type Fetcher,
} from './transport'

const entry: OutboxEntry = {
  kind: 'event',
  listId: 'list-1',
  action: {
    type: 'shopping/itemAdded',
    payload: { listId: 'list-1', itemId: 'apples' },
    meta: { eventId: 'e1', deviceId: 'device-1' },
  },
}

function respondingWith(status: number, body: unknown): Fetcher {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

describe('sendEntry', () => {
  it('posts an event to its list log and confirms on 200', async () => {
    const calls: string[] = []
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(
        new Response(
          JSON.stringify({ position: '00000000000000000007', eventId: 'e1' }),
          { status: 200 },
        ),
      )
    }
    const result = await sendEntry(entry, fetcher)
    expect(result).toEqual({ outcome: 'confirmed' })
    expect(calls).toEqual(['/lists/list-1/events'])
  })

  it('posts a command to its own path', async () => {
    const calls: string[] = []
    const command: OutboxEntry = {
      kind: 'command',
      path: '/lists',
      wire: {
        type: 'lists/listCreated',
        payload: { listId: 'l1', name: 'REWE', createdBy: 'user-1' },
        meta: { eventId: 'e9', deviceId: 'device-1' },
      },
    }
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    await sendEntry(command, fetcher)
    expect(calls).toEqual(['/lists'])
  })

  it('classifies 4xx as rejected and 5xx as retry', async () => {
    expect(await sendEntry(entry, respondingWith(403, {}))).toEqual({
      outcome: 'rejected',
      status: 403,
    })
    expect(await sendEntry(entry, respondingWith(503, {}))).toEqual({
      outcome: 'retry',
    })
  })

  it('classifies network errors as retry', async () => {
    const offline: Fetcher = () => Promise.reject(new Error('offline'))
    expect(await sendEntry(entry, offline)).toEqual({ outcome: 'retry' })
  })
})

describe('catch-up fetchers', () => {
  it('fetchListIds returns the id list', async () => {
    const ids = await fetchListIds(respondingWith(200, { lists: ['a', 'b'] }))
    expect(ids).toEqual(['a', 'b'])
  })

  it('fetchEventsSince appends the cursor as query parameter', async () => {
    const calls: string[] = []
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(
        new Response(JSON.stringify({ events: [] }), { status: 200 }),
      )
    }
    await fetchEventsSince('list-1', '00000000000000000005', fetcher)
    await fetchEventsSince('list-1', null, fetcher)
    expect(calls).toEqual([
      '/lists/list-1/events?since=00000000000000000005',
      '/lists/list-1/events',
    ])
  })

  it('fetchEventsSince throws on a non-ok response', async () => {
    await expect(
      fetchEventsSince('list-1', null, respondingWith(500, {})),
    ).rejects.toThrow()
  })
})
