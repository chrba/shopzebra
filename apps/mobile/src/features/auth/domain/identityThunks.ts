// Identity thunks. Auth is not optimistic: the guest identity only exists
// after Cognito confirms it, which is why these are thunks and not events.

import type { AppDispatch, RootState } from '../../../app/store'
import { startSync } from '../../../app/sync/startSync'
import { ensureShadowAccount } from './shadowAccount'
import {
  guestIdentityCreated,
  selectCurrentUserId,
  selectDisplayName,
  selectHasAccount,
} from './authSlice'

/**
 * Turns a purely local device into one the server knows: creates the shadow
 * account under the id the device has had since its first start, then lets
 * the sync engine off the leash. Called at the first share or join — never
 * with a question to the user, because the device has had a name since its
 * first start. Nothing is rewritten: every event already names this id.
 */
export const ensureIdentity =
  () =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    if (selectHasAccount(getState())) return

    const userId = selectCurrentUserId(getState())
    const name = selectDisplayName(getState())
    await ensureShadowAccount(name)
    dispatch(guestIdentityCreated({ userId, name }))

    // Only now is there something to sync with — the queued events flush.
    startSync()
  }
