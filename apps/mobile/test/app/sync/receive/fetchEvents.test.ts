import { describe, expect, it } from 'vitest'
import type { Fetcher } from '@/app/authFetch'
import {
  fetchEventsSince,
  fetchListIds,
} from '@/app/sync/receive/fetchEvents'

function respondingWith(status: number, body: unknown): Fetcher {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

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
