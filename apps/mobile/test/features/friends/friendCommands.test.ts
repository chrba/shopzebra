import { describe, expect, it } from 'vitest'
import {
  acceptFriendInvite,
  createFriendInvite,
  fetchFriends,
  removeFriend,
} from '@/features/friends/friendCommands'

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

describe('fetchFriends', () => {
  it('reads the address book with names', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, {
      friends: [
        { id: 'sarah', name: 'Sarah' },
        { id: 'tom', name: null },
      ],
    })

    const friends = await fetchFriends(fetcher)

    expect(firstCall().path).toBe('/friends')
    expect(friends).toEqual([
      { id: 'sarah', name: 'Sarah' },
      { id: 'tom', name: null },
    ])
  })

  it('drops malformed entries instead of failing the whole list', async () => {
    const { fetcher } = recordingFetcher(200, {
      friends: [{ id: 'sarah', name: 'Sarah' }, { name: 'ohne id' }, null],
    })

    await expect(fetchFriends(fetcher)).resolves.toEqual([
      { id: 'sarah', name: 'Sarah' },
    ])
  })
})

describe('createFriendInvite', () => {
  it('posts and returns the token', async () => {
    const { fetcher, firstCall } = recordingFetcher(201, {
      token: 'tok-1',
      expiresAt: 42,
    })

    const invite = await createFriendInvite(fetcher)

    expect(firstCall().path).toBe('/friends/invites')
    expect(firstCall().init?.method).toBe('POST')
    expect(invite).toEqual({ token: 'tok-1', expiresAt: 42 })
  })
})

describe('acceptFriendInvite', () => {
  it('sends the token and returns the inviter', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, { friendId: 'sarah' })

    const accepted = await acceptFriendInvite('tok-1', fetcher)

    expect(firstCall().path).toBe('/friends/join')
    expect(JSON.parse(String(firstCall().init?.body))).toEqual({
      payload: { token: 'tok-1' },
    })
    expect(accepted).toEqual({ friendId: 'sarah' })
  })

  it('rejects an invalid token', async () => {
    const { fetcher } = recordingFetcher(400, { error: 'invalid' })

    await expect(acceptFriendInvite('bad', fetcher)).rejects.toThrow('400')
  })
})

describe('removeFriend', () => {
  it('deletes only by id', async () => {
    const { fetcher, firstCall } = recordingFetcher(200, {})

    await removeFriend('tom', fetcher)

    expect(firstCall().path).toBe('/friends/tom')
    expect(firstCall().init?.method).toBe('DELETE')
  })
})
