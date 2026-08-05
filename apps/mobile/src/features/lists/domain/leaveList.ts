// Leaving a list somebody else owns. The counterpart of deleting: nothing
// is destroyed, this device just stops taking part (sharing-model.md — a
// member may always remove themselves).

import type { AppDispatch, RootState } from '../../../app/store'
import { selectDeviceId } from '../../../app/appSlice'
import { selectCurrentUserId } from '../../auth/domain/authSlice'
import { authFetch, type Fetcher } from '../../../app/authFetch'
import { removeMember } from '../../sharing/memberCommands'
import { listLeft, listRestored, selectListById } from './listsSlice'

/**
 * True when the server refuses because it does not count us as a member.
 * Then the list is already not ours — a leftover from an identity this
 * device no longer has, or a membership the owner ended. Either way it has
 * no business staying on screen, so this is a success, not a failure.
 */
function alreadyNotAMember(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return message.includes('403') || message.includes('404')
}

/**
 * Drops the list from this device at once, then tells the server.
 *
 * Optimistic on purpose: a tap must not wait for the network, and the
 * membership the server owns is the only thing that needs its yes. If it
 * refuses, the list comes back and the caller is told so it can say what
 * happened — the promise rejects in that case.
 * @param listId Which list to leave.
 * @param fetcher Injected in tests; the app uses the authenticated one.
 */
export const leaveList =
  (listId: string, fetcher: Fetcher = authFetch) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const state = getState()
    const left = selectListById(state, listId)
    dispatch(listLeft({ id: listId }))

    try {
      await removeMember(
        { kind: 'list', id: listId },
        selectCurrentUserId(state),
        { eventId: crypto.randomUUID(), deviceId: selectDeviceId(state) },
        fetcher,
      )
    } catch (error: unknown) {
      // Already not a member: leaving had happened before, so the list has
      // no business coming back. Anything else is a real failure.
      if (alreadyNotAMember(error)) return
      if (left) dispatch(listRestored({ list: left }))
      throw error
    }
  }
