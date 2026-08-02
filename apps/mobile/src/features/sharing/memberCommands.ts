// Class-2 commands of sharing. Every one of them needs the server's answer
// BEFORE anything can be shown or dispatched, so they are the documented
// direct-fetch exception — they never enter the outbox. The events they
// cause (the member-added / member-removed events of the aggregate) are
// written by the server and reach this device through the cursor catch-up.
//
// Nothing here knows about lists in particular: a recipe is shared through
// the very same endpoints, one path segment apart.

import { authFetch, type Fetcher } from '../../app/authFetch'
import {
  collectionPathFor,
  parseAggregate,
  type Aggregate,
  type AggregateKind,
} from '../../app/sync/aggregate'

export type Invite = {
  readonly token: string
  readonly expiresAt: number
}

export type EventIdentity = {
  readonly eventId: string
  readonly deviceId: string
}

function pathOf(aggregate: Aggregate, suffix: string): string {
  return `${collectionPathFor(aggregate.kind)}/${aggregate.id}${suffix}`
}

/** Owner-only. Returns the aggregate's active token — the server reuses it. */
export async function fetchInvite(
  aggregate: Aggregate,
  fetcher: Fetcher = authFetch,
): Promise<Invite> {
  const path = pathOf(aggregate, '/invites')
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

/**
 * Redeems an invite token; the server writes the member-added event. What
 * was joined comes back from the server: the token carries the aggregate,
 * so the same endpoint redeems an invite to a list or to a recipe.
 */
export async function joinByToken(
  token: string,
  meta: EventIdentity,
  fetcher: Fetcher = authFetch,
): Promise<Aggregate> {
  const response = await fetcher('/lists/join', {
    method: 'POST',
    body: JSON.stringify({ payload: { token }, meta }),
  })
  if (!response.ok) throw new Error(`POST /lists/join → ${response.status}`)

  const body: unknown = await response.json()
  const joined = parseAggregate(
    (body as { readonly aggregate?: unknown }).aggregate,
  )
  if (!joined) throw new Error('join response is malformed')
  return joined
}

/**
 * Owner removes anyone, a member removes themselves. The server writes the
 * member-removed event; who asks comes from the JWT, not the body.
 */
export async function removeMember(
  aggregate: Aggregate,
  memberId: string,
  meta: EventIdentity,
  fetcher: Fetcher = authFetch,
): Promise<void> {
  const path = pathOf(aggregate, `/members/${memberId}`)
  const response = await fetcher(path, {
    method: 'DELETE',
    body: JSON.stringify({ meta }),
  })
  if (!response.ok) throw new Error(`DELETE ${path} → ${response.status}`)
}

/**
 * Puts a friend straight onto an aggregate, no invite token — the server
 * checks the address book and the member cap. A 409 means it is full.
 */
export async function addMember(
  aggregate: Aggregate,
  memberId: string,
  meta: EventIdentity,
  fetcher: Fetcher = authFetch,
): Promise<void> {
  const path = pathOf(aggregate, '/members')
  const response = await fetcher(path, {
    method: 'POST',
    body: JSON.stringify({ payload: { memberId }, meta }),
  })
  if (!response.ok) throw new Error(`POST ${path} → ${response.status}`)
}

export type SharingProjection = {
  readonly ownerNames: Readonly<Record<string, string>>
  /** Member cap per aggregate; null when the server did not send one. */
  readonly maxMembers: number | null
}

/**
 * The parts of a collection response the sharing screens need: owner
 * display names and the member cap. Read here rather than during catch-up —
 * the sync cycle should not pay for them on every pull.
 */
export async function fetchSharingProjection(
  kind: AggregateKind,
  fetcher: Fetcher = authFetch,
): Promise<SharingProjection> {
  const path = collectionPathFor(kind)
  const response = await fetcher(path)
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}`)

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
