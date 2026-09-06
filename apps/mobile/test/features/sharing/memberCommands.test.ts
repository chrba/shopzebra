import { describe, expect, it } from 'vitest'
import {
  fetchInvite,
  fetchSharingProjection,
  joinByToken,
  removeMember,
} from '@/features/sharing/memberCommands'
import type { Aggregate } from '@/app/sync/aggregate'

const list1: Aggregate = { kind: 'list', id: 'l1' }
const bolognese: Aggregate = { kind: 'recipe', id: 'bolo' }

type RecordedCall = {
  readonly path: string
  readonly init: RequestInit | undefined
}

function recordingFetcher(status: number, body: unknown) {
  const calls: RecordedCall[] = []
  const fetcher = (path: string, init?: RequestInit) => {
    calls.push({ path, init })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
  const firstCall = (): RecordedCall => {
    const call = calls[0]
    if (!call) throw new Error('the fetcher was never called')
    return call
  }
  return { fetcher, firstCall }
}

const meta = { eventId: 'e1', deviceId: 'd1' }

describe('fetchInvite', () => {
  it('posts to the list invites endpoint and returns the token', async () => {
    const { fetcher, firstCall } = recordingFetcher(201, {
      token: 'tok-1',
      expiresAt: 42,
    })

    const invite = await fetchInvite(list1, fetcher)

    expect(firstCall().path).toBe('/lists/l1/invites')
    expect(firstCall().init?.method).toBe('POST')
    expect(invite).toEqual({ token: 'tok-1', expiresAt: 42 })
  })

  it('reaches the recipe invites endpoint for a recipe', async () => {
    const { fetcher, firstCall } = recordingFetcher(201, {
      token: 'tok-1',
      expiresAt: 42,
    })

    await fetchInvite(bolognese, fetcher)

    expect(firstCall().path).toBe('/recipes/bolo/invites')
  })

  it('rejects a malformed response rather than returning half a token', async () => {
    const { fetcher } = recordingFetcher(201, { token: 'tok-1' })

    await expect(fetchInvite(list1, fetcher)).rejects.toThrow('malformed')
  })

  it('rejects when the caller is not the owner', async () => {
    const { fetcher } = recordingFetcher(403, { error: 'only the owner' })

    await expect(fetchInvite(list1, fetcher)).rejects.toThrow('403')
  })
})

describe('joinByToken', () => {
  it('sends the token in action shape and returns the aggregate that was joined', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, {
      aggregate: { kind: 'list', id: 'l1' },
    })

    const joined = await joinByToken('tok-1', meta, fetcher)

    expect(firstCall().path).toBe('/lists/join')
    expect(firstCall().init?.method).toBe('POST')
    expect(JSON.parse(String(firstCall().init?.body))).toEqual({
      payload: { token: 'tok-1' },
      meta,
    })
    expect(joined).toEqual({ kind: 'list', id: 'l1' })
  })

  it('redeems an invite to a recipe through the very same endpoint', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, {
      aggregate: { kind: 'recipe', id: 'bolo' },
    })

    const joined = await joinByToken('tok-1', meta, fetcher)

    expect(firstCall().path).toBe('/lists/join')
    expect(joined).toEqual({ kind: 'recipe', id: 'bolo' })
  })

  it('rejects an invalid or expired token', async () => {
    const { fetcher } = recordingFetcher(400, { error: 'invalid' })

    await expect(joinByToken('bad', meta, fetcher)).rejects.toThrow('400')
  })

  it('rejects a response that does not say what was joined', async () => {
    const { fetcher } = recordingFetcher(200, { listId: 'l1' })

    await expect(joinByToken('tok-1', meta, fetcher)).rejects.toThrow(
      'malformed',
    )
  })
})

describe('removeMember', () => {
  it('deletes the member and carries the event identity', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, {})

    await removeMember(list1, 'tom', meta, fetcher)

    expect(firstCall().path).toBe('/lists/l1/members/tom')
    expect(firstCall().init?.method).toBe('DELETE')
    expect(JSON.parse(String(firstCall().init?.body))).toEqual({ meta })
  })

  it('removes somebody from a recipe through the recipe route', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, {})

    await removeMember(bolognese, 'tom', meta, fetcher)

    expect(firstCall().path).toBe('/recipes/bolo/members/tom')
  })

  it('rejects when the caller may not remove', async () => {
    const { fetcher } = recordingFetcher(403, { error: 'only the owner' })

    await expect(removeMember(list1, 'tom', meta, fetcher)).rejects.toThrow(
      '403',
    )
  })
})

describe('fetchSharingProjection', () => {
  it('reads the owner names from the list projection', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, {
      lists: ['l1'],
      ownerNames: { l1: 'Sarah' },
    })

    const projection = await fetchSharingProjection('list', fetcher)

    expect(firstCall().path).toBe('/lists')
    expect(projection.ownerNames).toEqual({ l1: 'Sarah' })
  })

  it('reads the recipe projection from the recipe collection', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, {
      recipes: ['bolo'],
      ownerNames: { bolo: 'Sarah' },
      maxMembers: 6,
    })

    const projection = await fetchSharingProjection('recipe', fetcher)

    expect(firstCall().path).toBe('/recipes')
    expect(projection).toEqual({ ownerNames: { bolo: 'Sarah' }, maxMembers: 6 })
  })

  it('yields nothing when the field is absent instead of failing', async () => {
    const { fetcher } = recordingFetcher(200, { lists: ['l1'] })

    await expect(fetchSharingProjection('list', fetcher)).resolves.toEqual({
      ownerNames: {},
      maxMembers: null,
    })
  })
})
