// Leaving a list somebody else owns. The counterpart of deleting: nothing
// is destroyed, this device just stops taking part (sharing-model.md — a
// member may always remove themselves).

import type { AppDispatch, RootState } from '../../../app/store'
import { selectDeviceId } from '../../../app/appSlice'
import { selectCurrentUserId } from '../../auth/domain/authSlice'
import { removeMember } from '../../sharing/memberCommands'
import { listLeft } from './listsSlice'

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
 * Removes this device's own membership, then drops the list locally.
 *
 * Not optimistic, and not an event: the server owns membership, and once
 * it accepts the removal nobody will ever send this device the matching
 * event — leaving ends access to that log. So the local removal only
 * happens after the server confirmed it. Rejects on failure so the caller
 * can say so; the list stays until then.
 */
export const leaveList =
  (listId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const state = getState()
    try {
      await removeMember(
        { kind: 'list', id: listId },
        selectCurrentUserId(state),
        { eventId: crypto.randomUUID(), deviceId: selectDeviceId(state) },
      )
    } catch (error: unknown) {
      if (!alreadyNotAMember(error)) throw error
    }
    dispatch(listLeft({ id: listId }))
  }
