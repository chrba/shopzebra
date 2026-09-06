// Redeeming an invite, in one place: the route runs it for a device that
// already has an identity, the name sheet runs it for one that just got
// its account. Both need the same three steps and the same outcomes.

import { store } from '../../app/store'
import { selectDeviceId } from '../../app/appSlice'
import { syncEngine } from '../../app/sync/syncEngine'
import type { Aggregate } from '../../app/sync/aggregate'
import { joinIntentCleared } from '../lists/join/joinIntentSlice'
import { joinByToken, refusedBecauseFull } from './memberCommands'

/** What redeeming a token led to. `full` deserves its own message. */
export type JoinOutcome =
  | { readonly status: 'joined'; readonly aggregate: Aggregate }
  | { readonly status: 'full' }
  | { readonly status: 'invalid' }

/**
 * Redeems the token, then pulls what was joined so the app can navigate
 * straight into it. Requires an identity — the server writes the
 * member-added event under the caller's JWT.
 */
export async function joinWithToken(token: string): Promise<JoinOutcome> {
  try {
    const aggregate = await joinByToken(token, {
      eventId: crypto.randomUUID(),
      deviceId: selectDeviceId(store.getState()),
    })
    // Cleared on success and on failure alike — a token left behind would
    // fire again on every later start.
    store.dispatch(joinIntentCleared())
    // Pull the new aggregate and its log before navigating into it.
    await syncEngine.requestSync()
    return { status: 'joined', aggregate }
  } catch (error: unknown) {
    store.dispatch(joinIntentCleared())
    // 409 is the server's "this list is full" — worth its own message.
    return { status: refusedBecauseFull(error) ? 'full' : 'invalid' }
  }
}
