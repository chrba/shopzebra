// Why the invite screen has a link — or why it has none. One place for both
// aggregate kinds: a list and a recipe are shared through the same endpoint,
// so they fail in the same ways and must say so in the same words.

import { authFetch, type Fetcher } from '../../app/authFetch'
import type { Aggregate } from '../../app/sync/aggregate'
import type { InviteState } from './InvitePage'
import { fetchInvite } from './memberCommands'

/**
 * Asks the server for the aggregate's active token and turns the answer into
 * the screen's state. Called by the invite route loaders, once this device
 * has an account, has pushed what it wrote and owns the aggregate.
 *
 * Every failure here is `unreachable`, a 403 included. `notOwner` is decided
 * before this runs, from the owner in the store — so whoever gets this far
 * believes they own the aggregate, and a 403 means the server disagrees.
 * In practice that is `NotAMember` rather than `OwnerOnly`: the server has
 * not heard of the aggregate yet. A race, not a verdict — another try is
 * exactly what fixes it, while "only the owner may invite" would be a dead
 * end with a Zurück button.
 */
export async function inviteStateOf(
  aggregate: Aggregate,
  fetcher: Fetcher = authFetch,
): Promise<InviteState> {
  try {
    return { status: 'ready', invite: await fetchInvite(aggregate, fetcher) }
  } catch (error: unknown) {
    console.warn(`minting the ${aggregate.kind} invite failed`, error)
    return { status: 'unreachable' }
  }
}
