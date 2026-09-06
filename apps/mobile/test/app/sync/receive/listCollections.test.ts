// Reading the membership projection per collection: what each named, and
// which of them could be read at all. The engine lets go of everything its
// collection does not name, so the second half is not decoration.

import { describe, expect, it } from 'vitest'
import type { Fetcher } from '@/app/authFetch'
import { listCollections } from '@/app/sync/receive/fetchEvents'

type Answer = { readonly status: number; readonly body: unknown }

function servingCollections(
  answers: Readonly<Record<string, Answer>>,
): Fetcher {
  return (path) => {
    const answer = answers[path]
    if (!answer) throw new Error(`unexpected path ${path}`)
    return Promise.resolve(
      new Response(JSON.stringify(answer.body), { status: answer.status }),
    )
  }
}

describe('listing the collections', () => {
  it('reports what each collection named, tagged with its kind', async () => {
    const collections = await listCollections(
      servingCollections({
        '/lists': { status: 200, body: { lists: ['a', 'b'] } },
        '/recipes': { status: 200, body: { recipes: ['bolo'] } },
      }),
    )

    expect(collections).toEqual([
      {
        kind: 'list',
        named: [
          { kind: 'list', id: 'a' },
          { kind: 'list', id: 'b' },
        ],
      },
      { kind: 'recipe', named: [{ kind: 'recipe', id: 'bolo' }] },
    ])
  })

  it('a caller who belongs to nothing gets collections that named nothing', async () => {
    const collections = await listCollections(
      servingCollections({
        '/lists': { status: 200, body: { lists: [] } },
        '/recipes': { status: 200, body: { recipes: [] } },
      }),
    )

    expect(collections.map((collection) => collection.kind)).toEqual([
      'list',
      'recipe',
    ])
    expect(
      collections.every((collection) => collection.named.length === 0),
    ).toBe(true)
  })

  // The difference the whole type exists for. "You are a member of none of
  // these" is an answer; "I could not ask" is not, and must not be dressed
  // up as one — the engine reads absence as a reason to let go.
  it('leaves out a collection it could not read, rather than calling it empty', async () => {
    const collections = await listCollections(
      servingCollections({
        '/lists': { status: 500, body: {} },
        '/recipes': { status: 200, body: { recipes: ['bolo'] } },
      }),
    )

    expect(collections.map((collection) => collection.kind)).toEqual(['recipe'])
  })

  it('one unreadable collection still costs the other nothing', async () => {
    const collections = await listCollections(
      servingCollections({
        '/lists': { status: 200, body: { lists: ['a'] } },
        '/recipes': { status: 500, body: {} },
      }),
    )

    expect(collections).toEqual([
      { kind: 'list', named: [{ kind: 'list', id: 'a' }] },
    ])
  })
})
