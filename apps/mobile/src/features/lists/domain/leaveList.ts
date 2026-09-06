// Leaving a list somebody else owns. The counterpart of deleting: nothing
// is destroyed, this device just stops taking part (sharing-model.md — a
// member may always remove themselves).

import type { AppDispatch, RootState } from '../../../app/store'
import { selectDeviceId } from '../../../app/appSlice'
import { selectCurrentUserId } from '../../auth/domain/authSlice'
import { authFetch, type Fetcher } from '../../../app/authFetch'
import { removeMember } from '../../sharing/memberCommands'
import { listDropped } from './listsSlice'

/**
 * Drops the list from this device, then tells the server it happened.
 *
 * Leaving is a local decision: the server is informed, not asked. The list
 * is gone from here the moment the tap lands, and no answer brings it
 * back — a refusal, a timeout or a dead network changes nothing about what
 * the user decided. None of them is a failure worth reporting either, so
 * this never rejects and the caller has nothing to catch.
 *
 * The price is a one-sided leave: if the request never lands, the server
 * still counts this device as a member, GET /lists keeps naming the list,
 * and the release in the outbox keeps the pull silent about it. The device
 * is right, the membership on the server leaks. There is no retry for
 * class-2 commands today; giving them one is a design decision of its own.
 * @param listId Which list to leave.
 * @param fetcher Injected in tests; the app uses the authenticated one.
 */
export const leaveList =
  (listId: string, fetcher: Fetcher = authFetch) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const state = getState()
    dispatch(listDropped({ listId }))

    try {
      await removeMember(
        { kind: 'list', id: listId },
        selectCurrentUserId(state),
        { eventId: crypto.randomUUID(), deviceId: selectDeviceId(state) },
        fetcher,
      )
    } catch (error: unknown) {
      console.warn('the server was not told that this device left a list', {
        listId,
        error,
      })
    }
  }
