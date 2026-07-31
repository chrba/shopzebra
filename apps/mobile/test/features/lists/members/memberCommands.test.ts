import { describe, expect, it } from 'vitest'
import {
  fetchListInvite,
  fetchOwnerNames,
  joinListByToken,
  removeMember,
} from '@/features/lists/members/memberCommands'

function recordingFetcher(status: number, body: unknown) {
  const calls: { path: string; init?: RequestInit }[] = []
  const fetcher = (path: string, init?: RequestInit) => {
    calls.push({ path, init })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
  return { fetcher, calls }
}

const meta = { eventId: 'e1', deviceId: 'd1' }

describe('fetchListInvite', () => {
  it('posts to the list invites endpoint and returns the token', async () => {
    const { fetcher, calls } = recordingFetcher(201, {
      token: 'tok-1',
      expiresAt: 42,
    })

    const invite = await fetchListInvite('l1', fetcher)

    expect(calls[0].path).toBe('/lists/l1/invites')
    expect(calls[0].init?.method).toBe('POST')
    expect(invite).toEqual({ token: 'tok-1', expiresAt: 42 })
  })

  it('rejects a malformed response rather than returning half a token', async () => {
    const { fetcher } = recordingFetcher(201, { token: 'tok-1' })

    await expect(fetchListInvite('l1', fetcher)).rejects.toThrow('malformed')
  })

  it('rejects when the caller is not the owner', async () => {
    const { fetcher } = recordingFetcher(403, { error: 'only the owner' })

    await expect(fetchListInvite('l1', fetcher)).rejects.toThrow('403')
  })
})

describe('joinListByToken', () => {
  it('sends the token in action shape and returns the list id', async () => {
    const { fetcher, calls } = recordingFetcher(200, { listId: 'l1' })

    const joined = await joinListByToken('tok-1', meta, fetcher)

    expect(calls[0].path).toBe('/lists/join')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      payload: { token: 'tok-1' },
      meta,
    })
    expect(joined).toEqual({ listId: 'l1' })
  })

  it('rejects an invalid or expired token', async () => {
    const { fetcher } = recordingFetcher(400, { error: 'invalid' })

    await expect(joinListByToken('bad', meta, fetcher)).rejects.toThrow('400')
  })
})

describe('removeMember', () => {
  it('deletes the member and carries the event identity', async () => {
    const { fetcher, calls } = recordingFetcher(200, {})

    await removeMember('l1', 'tom', meta, fetcher)

    expect(calls[0].path).toBe('/lists/l1/members/tom')
    expect(calls[0].init?.method).toBe('DELETE')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ meta })
  })

  it('rejects when the caller may not remove', async () => {
    const { fetcher } = recordingFetcher(403, { error: 'only the owner' })

    await expect(removeMember('l1', 'tom', meta, fetcher)).rejects.toThrow('403')
  })
})

describe('fetchOwnerNames', () => {
  it('reads the owner names from the list projection', async () => {
    const { fetcher, calls } = recordingFetcher(200, {
      lists: ['l1'],
      ownerNames: { l1: 'Sarah' },
    })

    const names = await fetchOwnerNames(fetcher)

    expect(calls[0].path).toBe('/lists')
    expect(names).toEqual({ l1: 'Sarah' })
  })

  it('yields nothing when the field is absent instead of failing', async () => {
    const { fetcher } = recordingFetcher(200, { lists: ['l1'] })

    await expect(fetchOwnerNames(fetcher)).resolves.toEqual({})
  })
})
