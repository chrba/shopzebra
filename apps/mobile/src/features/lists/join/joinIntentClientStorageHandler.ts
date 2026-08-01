import { removeItem, setItem } from '../../../app/clientStorage'
import {
  friendIntentCleared,
  friendIntentStored,
  joinIntentCleared,
  joinIntentStored,
} from './joinIntentSlice'

/** Small value, so Preferences rather than the Filesystem — like deviceId. */
export const JOIN_INTENT_KEY = 'shopzebra_join_intent'
export const FRIEND_INTENT_KEY = 'shopzebra_friend_intent'

/**
 * Persists the pending invite token. Called by clientStorageMiddleware after
 * each dispatch. The token has to outlive an app kill: the invitee switches
 * to the mail app for the confirmation code, and mobile OSes reclaim
 * backgrounded apps freely.
 */
export function joinIntentClientStorageHandler(action: {
  readonly type: string
  readonly payload?: unknown
}): void {
  if (joinIntentStored.match(action)) {
    void setItem(JOIN_INTENT_KEY, action.payload.token)
    return
  }
  if (joinIntentCleared.match(action)) {
    void removeItem(JOIN_INTENT_KEY)
    return
  }
  if (friendIntentStored.match(action)) {
    void setItem(FRIEND_INTENT_KEY, action.payload.token)
    return
  }
  if (friendIntentCleared.match(action)) {
    void removeItem(FRIEND_INTENT_KEY)
  }
}
