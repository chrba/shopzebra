import { describe, expect, it } from 'vitest'
import type { Fetcher } from '@/app/authFetch'
import {
  fetchAggregates,
  fetchEventsSince,
} from '@/app/sync/receive/fetchEvents'
import type { Aggregate } from '@/app/sync/aggregate'

const list1: Aggregate = { kind: 'list', id: 'list-1' }

function respondingWith(status: number, body: unknown): Fetcher {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

/** Answers each collection endpoint with its own body, like the server does. */
function servingCollections(
  bodyByPath: Readonly<
    Record<string, { readonly status: number; readonly body: unknown }>
  >,
): Fetcher {
  return (path) => {
    const answer = bodyByPath[path] ?? { status: 404, body: {} }
    return Promise.resolve(
      new Response(JSON.stringify(answer.body), { status: answer.status }),
    )
  }
}

describe('catch-up fetchers', () => {
  it('fetchAggregates returns every kind the caller may see, each tagged with its kind', async () => {
    const aggregates = await fetchAggregates(
      servingCollections({
        '/lists': { status: 200, body: { lists: ['a', 'b'] } },
        '/recipes': { status: 200, body: { recipes: ['bolo'] } },
      }),
    )

    expect(aggregates).toEqual([
      { kind: 'list', id: 'a' },
      { kind: 'list', id: 'b' },
      { kind: 'recipe', id: 'bolo' },
    ])
  })

  it('an unreachable collection does not cost the caller the other one', async () => {
    const aggregates = await fetchAggregates(
      servingCollections({
        '/lists': { status: 200, body: { lists: ['a'] } },
        '/recipes': { status: 500, body: {} },
      }),
    )

    expect(aggregates).toEqual([{ kind: 'list', id: 'a' }])
  })

  it('fetchEventsSince appends the cursor as query parameter', async () => {
    const calls: string[] = []
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(
        new Response(JSON.stringify({ events: [] }), { status: 200 }),
      )
    }
    await fetchEventsSince(list1, '00000000000000000005', fetcher)
    await fetchEventsSince(list1, null, fetcher)
    expect(calls).toEqual([
      '/lists/list-1/events?since=00000000000000000005',
      '/lists/list-1/events',
    ])
  })

  it('a recipe is pulled from the recipe log', async () => {
    const calls: string[] = []
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(
        new Response(JSON.stringify({ events: [] }), { status: 200 }),
      )
    }

    await fetchEventsSince({ kind: 'recipe', id: 'bolo' }, null, fetcher)

    expect(calls).toEqual(['/recipes/bolo/events'])
  })

  it('fetchEventsSince throws on a non-ok response', async () => {
    await expect(
      fetchEventsSince(list1, null, respondingWith(500, {})),
    ).rejects.toThrow()
  })
})
