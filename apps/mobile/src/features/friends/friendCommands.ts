// Commands of the friends feature. All of them need the server's answer
// before anything can be shown or dispatched, so they are direct fetches —
// friendships live outside the event log and never travel the outbox.

import { authFetch, type Fetcher } from '../../app/authFetch'
import type { Friend } from './domain/friendsSlice'

export type FriendInvite = {
  readonly token: string
  readonly expiresAt: number
}

/** The caller's address book, names included. */
export async function fetchFriends(
  fetcher: Fetcher = authFetch,
): Promise<readonly Friend[]> {
  const response = await fetcher('/friends')
  if (!response.ok) throw new Error(`GET /friends → ${response.status}`)

  const body: unknown = await response.json()
  const friends = (body as { readonly friends?: unknown }).friends
  if (!Array.isArray(friends)) throw new Error('friends response is malformed')

  return friends.flatMap((entry: unknown): readonly Friend[] => {
    if (entry === null || typeof entry !== 'object') return []
    const { id, name } = entry as { readonly id?: unknown; readonly name?: unknown }
    if (typeof id !== 'string') return []
    return [{ id, name: typeof name === 'string' ? name : null }]
  })
}

/** Mints the caller's friendship link — the server reuses an active token. */
export async function createFriendInvite(
  fetcher: Fetcher = authFetch,
): Promise<FriendInvite> {
  const response = await fetcher('/friends/invites', { method: 'POST' })
  if (!response.ok) {
    throw new Error(`POST /friends/invites → ${response.status}`)
  }

  const body: unknown = await response.json()
  const { token, expiresAt } = body as {
    readonly token?: unknown
    readonly expiresAt?: unknown
  }
  if (typeof token !== 'string' || typeof expiresAt !== 'number') {
    throw new Error('friend invite response is malformed')
  }
  return { token, expiresAt }
}

/**
 * Redeems a friendship link. The server writes both directions; no event is
 * involved, so no eventId travels along. Returns the inviter's user id.
 */
export async function acceptFriendInvite(
  token: string,
  fetcher: Fetcher = authFetch,
): Promise<{ readonly friendId: string }> {
  const response = await fetcher('/friends/join', {
    method: 'POST',
    body: JSON.stringify({ payload: { token } }),
  })
  if (!response.ok) throw new Error(`POST /friends/join → ${response.status}`)

  const body: unknown = await response.json()
  const { friendId } = body as { readonly friendId?: unknown }
  if (typeof friendId !== 'string') {
    throw new Error('friend join response is malformed')
  }
  return { friendId }
}

/** Deletes only the caller's own side — the friend keeps theirs. */
export async function removeFriend(
  friendId: string,
  fetcher: Fetcher = authFetch,
): Promise<void> {
  const response = await fetcher(`/friends/${friendId}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`DELETE /friends/${friendId} → ${response.status}`)
  }
}
