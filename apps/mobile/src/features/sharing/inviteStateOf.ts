// Why the invite screen has a link — or why it has none. One place for both
// aggregate kinds: a list and a recipe are shared through the same endpoint,
// so they fail in the same two ways and must say so in the same two words.

import { authFetch, type Fetcher } from '../../app/authFetch'
import type { Aggregate } from '../../app/sync/aggregate'
import type { InviteState } from './InvitePage'
import { fetchInvite, InviteNotMinted } from './memberCommands'

/** Only the owner mints invites, so a refusal stays refused. */
const FORBIDDEN = 403

/**
 * Asks the server for the aggregate's active token and turns the answer into
 * the screen's state. Called by the invite route loaders, once the device has
 * an account, has pushed what it wrote and owns the aggregate.
 *
 * The two failures are told apart on purpose: a refusal is the server's
 * verdict on who may invite and no amount of retrying changes it, while a
 * request that never arrived is worth another try. Saying "check your
 * connection" to either one would be wrong for one of them.
 */
export async function inviteStateOf(
  aggregate: Aggregate,
  fetcher: Fetcher = authFetch,
): Promise<InviteState> {
  try {
    return { status: 'ready', invite: await fetchInvite(aggregate, fetcher) }
  } catch (error: unknown) {
    console.warn(`minting the ${aggregate.kind} invite failed`, error)
    return error instanceof InviteNotMinted && error.status === FORBIDDEN
      ? { status: 'notOwner' }
      : { status: 'unreachable' }
  }
}
