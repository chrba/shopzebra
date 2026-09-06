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
  listMemberAddedLocally,
  listMemberRemovedLocally,
} from '../lists/domain/listsSlice'
import {
  recipeMemberAddedLocally,
  recipeMemberRemovedLocally,
} from '../recipes/domain/recipesSlice'
import {
  collectionPathFor,
  parseAggregate,
  type Aggregate,
  type AggregateKind,
} from '../../app/sync/aggregate'

/**
 * A command the server turned down, carrying the status it answered with.
 * The status is a field and not a phrase in the message on purpose: the
 * message names the path, the path carries list and member ids, and an id
 * may contain any three digits — so a `403` read out of the text can just
 * as well be a slice of a UUID. Callers that act on a status read this one.
 */
export class CommandRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'CommandRefused'
  }
}

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
  if (!response.ok) {
    throw new CommandRefused(response.status, `POST ${path} → ${response.status}`)
  }

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
  if (!response.ok) {
    throw new CommandRefused(response.status, `POST /lists/join → ${response.status}`)
  }

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
  if (!response.ok) {
    throw new CommandRefused(response.status, `DELETE ${path} → ${response.status}`)
  }
}

/**
 * The server's "no room left": the member cap of the aggregate is reached.
 * Its own function because two screens ask it and both used to look for the
 * digits in the message, where an id can supply them just as well.
 */
export function refusedBecauseFull(error: unknown): boolean {
  return error instanceof CommandRefused && error.status === 409
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
  if (!response.ok) {
    throw new CommandRefused(response.status, `POST ${path} → ${response.status}`)
  }
}

/**
 * The member-added fact of this device, dispatched the moment the friend is
 * tapped, before the command has travelled: the row must appear now, not one
 * round trip later. If the server refuses, memberRemovedLocally takes it
 * back off.
 */
export function memberAddedLocally(
  aggregate: Aggregate,
  memberId: string,
  name: string,
) {
  return aggregate.kind === 'recipe'
    ? recipeMemberAddedLocally({ recipeId: aggregate.id, memberId, name })
    : listMemberAddedLocally({ listId: aggregate.id, memberId, name })
}

/**
 * The member-removed fact of this device. Dispatched right after the command
 * succeeded (or after an add was refused): the server's event would only
 * arrive with the next pull — and if this device removed itself, never.
 */
export function memberRemovedLocally(aggregate: Aggregate, memberId: string) {
  return aggregate.kind === 'recipe'
    ? recipeMemberRemovedLocally({ recipeId: aggregate.id, memberId })
    : listMemberRemovedLocally({ listId: aggregate.id, memberId })
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
  if (!response.ok) {
    throw new CommandRefused(response.status, `GET ${path} → ${response.status}`)
  }

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
