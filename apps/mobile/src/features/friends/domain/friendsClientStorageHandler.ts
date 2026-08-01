import { setItem } from '../../../app/clientStorage'
import { friendRemoved, friendsLoaded } from './friendsSlice'

export const FRIENDS_STORAGE_KEY = 'shopzebra_friends'

/**
 * Caches the address book so the friends screen shows the last known state
 * offline. Called by clientStorageMiddleware after each dispatch; writes on
 * every server answer and on optimistic removals, never on cache hydration
 * (that would re-write what was just read).
 */
export function friendsClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  if (!friendsLoaded.match(action) && !friendRemoved.match(action)) return
  const state = getState() as {
    readonly friends: { readonly friends: readonly unknown[] }
  }
  void setItem(FRIENDS_STORAGE_KEY, JSON.stringify(state.friends.friends))
}
