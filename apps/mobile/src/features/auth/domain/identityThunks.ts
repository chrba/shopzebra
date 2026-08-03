// Identity thunks. Auth is not optimistic: the guest identity only exists
// after Cognito confirms it, which is why these are thunks and not events.

import type { AppDispatch, RootState } from '../../../app/store'
import { startSync } from '../../../app/sync/startSync'
import { syncEngine } from '../../../app/sync/syncEngine'
import { pendingAuthorRewritten } from '../../../app/sync/withSync'
import { ensureShadowAccount } from './shadowAccount'
import { LOCAL_USER_ID } from './localUser'
import {
  guestIdentityCreated,
  identityAttached,
  selectHasIdentity,
} from './authSlice'

/**
 * Turns a purely local device into one the server knows: creates the shadow
 * account, moves everything written so far onto it and lets the sync engine
 * off the leash. Called at the first share or join (with a name); M2 will
 * also call it before linking an account.
 *
 * The order is the point. Everything is rewritten to the new author while
 * server contact is still forbidden — the queued log first, then the folded
 * state, then the reducer's mirror of the queue. Only after that may a
 * cycle run, and it finds a backlog the server will accept.
 */
export const ensureIdentity =
  (name?: string) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    if (selectHasIdentity(getState())) return

    const userId = await ensureShadowAccount(name)

    await syncEngine.rewriteQueuedAuthor(LOCAL_USER_ID, userId)
    dispatch(identityAttached({ previousUserId: LOCAL_USER_ID, userId }))
    dispatch(pendingAuthorRewritten(LOCAL_USER_ID, userId))
    dispatch(guestIdentityCreated({ userId, name: name ?? '' }))

    // Only now is there something to sync with — the queued events flush.
    startSync()
  }
