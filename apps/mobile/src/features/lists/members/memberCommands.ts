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

export type ListProjection = {
  readonly ownerNames: Readonly<Record<string, string>>
  /** Member cap per list; null when the server did not send one. */
  readonly maxMembers: number | null
}

/**
 * The parts of GET /lists the members screens need: owner display names and
 * the member cap. Read here rather than during catch-up — the sync cycle
 * should not pay for them on every pull.
 */
export async function fetchListProjection(
  fetcher: Fetcher = authFetch,
): Promise<ListProjection> {
  const response = await fetcher('/lists')
  if (!response.ok) throw new Error(`GET /lists → ${response.status}`)

  const body: unknown = await response.json()
  const { ownerNames, maxMembers } = body as {
    readonly ownerNames?: unknown
    readonly maxMembers?: unknown
  }

  const names =
    ownerNames !== null && typeof ownerNames === 'object'
      ? Object.fromEntries(
          Object.entries(ownerNames).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {}

  return {
    ownerNames: names,
    maxMembers: typeof maxMembers === 'number' ? maxMembers : null,
  }
}

/** Owner display names keyed by list id — the projection's name half. */
export async function fetchOwnerNames(
  fetcher: Fetcher = authFetch,
): Promise<Readonly<Record<string, string>>> {
  return (await fetchListProjection(fetcher)).ownerNames
}

/**
 * Puts a friend straight onto a list, no invite token — the server checks
 * the address book and the member cap. A 409 means the list is full.
 */
export async function addMemberToList(
  listId: string,
  memberId: string,
  meta: EventIdentity,
  fetcher: Fetcher = authFetch,
): Promise<void> {
  const path = `/lists/${listId}/members`
  const response = await fetcher(path, {
    method: 'POST',
    body: JSON.stringify({ payload: { memberId }, meta }),
  })
  if (!response.ok) throw new Error(`POST ${path} → ${response.status}`)
}
