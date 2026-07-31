// Class-2 commands of the members feature. Every one of them needs the
// server's answer BEFORE anything can be shown or dispatched, so they are
// the documented direct-fetch exception — they never enter the outbox.
// The events they cause (listMemberAdded, listMemberRemoved) are written by
// the server and reach this device through the cursor catch-up.

import { authFetch, type Fetcher } from '../../../app/authFetch'

export type ListInvite = {
  readonly token: string
  readonly expiresAt: number
}

export type EventIdentity = {
  readonly eventId: string
  readonly deviceId: string
}

/** Owner-only. Returns the list's active token — the server reuses it. */
export async function fetchListInvite(
  listId: string,
  fetcher: Fetcher = authFetch,
): Promise<ListInvite> {
  const path = `/lists/${listId}/invites`
  const response = await fetcher(path, { method: 'POST' })
  if (!response.ok) throw new Error(`POST ${path} → ${response.status}`)

  const body: unknown = await response.json()
  const { token, expiresAt } = body as {
    readonly token?: unknown
    readonly expiresAt?: unknown
  }
  if (typeof token !== 'string' || typeof expiresAt !== 'number') {
    throw new Error('invite response is malformed')
  }
  return { token, expiresAt }
}

/** Redeems an invite token; the server writes lists/listMemberAdded. */
export async function joinListByToken(
  token: string,
  meta: EventIdentity,
  fetcher: Fetcher = authFetch,
): Promise<{ readonly listId: string }> {
  const response = await fetcher('/lists/join', {
    method: 'POST',
    body: JSON.stringify({ payload: { token }, meta }),
  })
  if (!response.ok) throw new Error(`POST /lists/join → ${response.status}`)

  const body: unknown = await response.json()
  const { listId } = body as { readonly listId?: unknown }
  if (typeof listId !== 'string') throw new Error('join response is malformed')
  return { listId }
}

/**
 * Owner removes anyone, a member removes themselves. The server writes
 * lists/listMemberRemoved; who asks comes from the JWT, not the body.
 */
export async function removeMember(
  listId: string,
  memberId: string,
  meta: EventIdentity,
  fetcher: Fetcher = authFetch,
): Promise<void> {
  const path = `/lists/${listId}/members/${memberId}`
  const response = await fetcher(path, {
    method: 'DELETE',
    body: JSON.stringify({ meta }),
  })
  if (!response.ok) throw new Error(`DELETE ${path} → ${response.status}`)
}

/**
 * Owner display names keyed by list id. Read here rather than during
 * catch-up: the owner's name is only ever shown on the members screen, and
 * the sync cycle should not pay for it on every pull.
 */
export async function fetchOwnerNames(
  fetcher: Fetcher = authFetch,
): Promise<Readonly<Record<string, string>>> {
  const response = await fetcher('/lists')
  if (!response.ok) throw new Error(`GET /lists → ${response.status}`)

  const body: unknown = await response.json()
  const ownerNames = (body as { readonly ownerNames?: unknown }).ownerNames
  if (ownerNames === null || typeof ownerNames !== 'object') return {}

  return Object.fromEntries(
    Object.entries(ownerNames).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}
