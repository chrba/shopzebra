// Auth thunks — call Amplify, then dispatch result actions.
//
// Auth is NOT optimistic: an identity only exists after Cognito confirms
// it. That's the exception where thunks are the right tool (server response
// needed BEFORE the meaningful state update). Creating the identity itself
// lives one file over, in identityThunks.ts.

import { signOut, updateUserAttributes } from 'aws-amplify/auth'
import type { AppDispatch, RootState } from '../../../app/store'
import { removeItem } from '../../../app/clientStorage'
import { stopSync } from '../../../app/sync/startSync'
import { listsLoaded } from '../../lists/domain/listsSlice'
import {
  friendIntentCleared,
  joinIntentCleared,
} from '../../lists/join/joinIntentSlice'
import {
  FRIEND_INTENT_KEY,
  JOIN_INTENT_KEY,
} from '../../lists/join/joinIntentClientStorageHandler'
import { FRIENDS_STORAGE_KEY } from '../../friends/domain/friendsClientStorageHandler'
import { friendsLoaded } from '../../friends/domain/friendsSlice'
import { shoppingLoaded } from '../../shopping/domain/shoppingSlice'
import { SHOPPING_STORAGE_KEY } from '../../shopping/domain/shoppingClientStorageHandler'
import {
  listPreferencesLoaded,
  recipePreferencesLoaded,
} from '../../preferences/domain/preferencesSlice'
import { RECIPE_PREFS_KEY } from '../../preferences/domain/preferencesClientStorageHandler'
import { recipesLoaded } from '../../recipes/domain/recipesSlice'
import { RECIPES_KEY } from '../../recipes/domain/recipesClientStorageHandler'
import { SHADOW_CREDENTIALS_KEY } from './shadowAccount'
import { rememberDeviceName } from './deviceName'
import { displayNameChanged, identityCleared, selectHasIdentity } from './authSlice'

// Mirrors router.ts's bootstrap keys — per-user storage purged on
// sign-out so a shared device never leaks one user's data to the next.
const LISTS_KEY = 'shopzebra_lists'
const PREFS_KEY = 'shopzebra_list_preferences'

/**
 * Signs out and wipes everything that belongs to this identity. Only a
 * linked account can reach it — a guest has nowhere to sign back in to, so
 * for them this would be a delete button in disguise (the profile hides it
 * until M2 turns it into an explicit "delete on this device").
 */
export const performSignOut = () => async (dispatch: AppDispatch) => {
  // Stop the sync engine first — before Amplify's session is torn down
  // and before any storage purge — so a shared-device user switch can
  // never POST this user's queued outbox events under the next user's
  // JWT (finding I1).
  await stopSync()
  try {
    await signOut()
  } finally {
    // Per-user data purge: device id and theme are per-device and
    // survive; everything else must not leak into the next user's
    // session on this device.
    await removeItem(LISTS_KEY)
    await removeItem(PREFS_KEY)
    await removeItem(SHOPPING_STORAGE_KEY)
    await removeItem(JOIN_INTENT_KEY)
    await removeItem(FRIEND_INTENT_KEY)
    await removeItem(FRIENDS_STORAGE_KEY)
    await removeItem(RECIPES_KEY)
    await removeItem(RECIPE_PREFS_KEY)
    // The shadow credentials are this identity too: left behind, the next
    // share on this device would silently resurrect the old account.
    await removeItem(SHADOW_CREDENTIALS_KEY)
    dispatch(listsLoaded({ lists: [] }))
    dispatch(recipesLoaded({ recipes: [] }))
    dispatch(recipePreferencesLoaded({}))
    dispatch(shoppingLoaded({ itemsByListId: {}, customVariantsByListId: {} }))
    dispatch(listPreferencesLoaded({}))
    // A pending invite belongs to the user who opened it, never to the
    // next one on a shared device.
    dispatch(joinIntentCleared())
    dispatch(friendIntentCleared())
    dispatch(friendsLoaded({ friends: [] }))
    dispatch(identityCleared())
  }
}

/**
 * Renames this device. Called when the profile's name field loses focus.
 *
 * The device is the owner of its name — it had one before any account
 * existed, so the local write comes first and always happens. Cognito only
 * gets told when there is an account to tell; otherwise the name travels
 * with the account when it is created.
 */
export const performChangeDisplayName =
  (args: { readonly name: string }) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const name = args.name.trim()
    if (name === '') return

    await rememberDeviceName(name)
    dispatch(displayNameChanged({ name }))

    if (!selectHasIdentity(getState())) return
    try {
      await updateUserAttributes({ userAttributes: { name } })
    } catch (error: unknown) {
      console.warn('telling Cognito the new name failed', error)
    }
  }
