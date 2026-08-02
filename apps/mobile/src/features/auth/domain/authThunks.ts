// Auth thunks — call Amplify, then dispatch result actions.
//
// Auth is NOT optimistic: the user is only signed in after Cognito confirms.
// That's the exception where thunks are the right tool (server response
// needed BEFORE the meaningful state update).

import {
  signIn,
  signUp,
  confirmSignUp,
  autoSignIn,
  updateUserAttributes,
  resetPassword,
  confirmResetPassword,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth'
import type { AppDispatch } from '../../../app/store'
import { removeItem } from '../../../app/clientStorage'
import { startSync, stopSync } from '../../../app/sync/startSync'
import { listsLoaded } from '../../lists/domain/listsSlice'
import { friendIntentCleared, joinIntentCleared } from '../../lists/join/joinIntentSlice'
import { FRIEND_INTENT_KEY, JOIN_INTENT_KEY } from '../../lists/join/joinIntentClientStorageHandler'
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
import {
  signInSucceeded,
  displayNameChanged,
  signInFailed,
  signUpSucceeded,
  signUpFailed,
  confirmSignUpSucceeded,
  confirmSignUpFailed,
  forgotPasswordCodeSent,
  forgotPasswordFailed,
  resetPasswordSucceeded,
  resetPasswordFailed,
  signedOut,
  type AuthUser,
} from './authSlice'

// Mirrors router.ts's bootstrap keys — per-user storage purged on
// sign-out so a shared device never leaks one user's data to the next.
const LISTS_KEY = 'shopzebra_lists'
const PREFS_KEY = 'shopzebra_list_preferences'

async function fetchCurrentAuthUser(): Promise<AuthUser> {
  const cognitoUser = await getCurrentUser()
  const session = await fetchAuthSession()
  const claims = session.tokens?.idToken?.payload
  return {
    userId: cognitoUser.userId,
    email: (claims?.email as string) ?? '',
    name: (claims?.name as string) ?? '',
    provider: 'email',
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = (error as { readonly name?: string }).name ?? ''
    switch (name) {
      case 'NotAuthorizedException':
        return 'E-Mail oder Passwort ist falsch'
      case 'UserNotFoundException':
        return 'E-Mail oder Passwort ist falsch'
      case 'UsernameExistsException':
        return 'Diese E-Mail-Adresse ist bereits registriert'
      case 'InvalidPasswordException':
        return 'Das Passwort erfüllt nicht die Anforderungen'
      case 'CodeMismatchException':
        return 'Der eingegebene Code ist falsch'
      case 'ExpiredCodeException':
        return 'Der Code ist abgelaufen. Bitte fordere einen neuen an'
      case 'LimitExceededException':
        return 'Zu viele Versuche. Bitte warte einen Moment'
      default:
        return error.message
    }
  }
  return 'Ein unbekannter Fehler ist aufgetreten'
}

export const performSignIn =
  (args: { readonly email: string; readonly password: string }) =>
  async (dispatch: AppDispatch) => {
    try {
      await signIn({ username: args.email, password: args.password })
      const user = await fetchCurrentAuthUser()
      dispatch(signInSucceeded({ user }))
      // beforeLoad only starts the engine on app boot — an in-session
      // sign-in (no reload) needs the same trigger here, or catch-up
      // never runs and recorded actions rot in the pre-start buffer.
      startSync()
    } catch (error) {
      dispatch(signInFailed({ error: toErrorMessage(error) }))
    }
  }

export const performSignUp =
  (args: {
    readonly name: string
    readonly email: string
    readonly password: string
  }) =>
  async (dispatch: AppDispatch) => {
    try {
      await signUp({
        username: args.email,
        password: args.password,
        // The display name has to exist from the very first moment: an
        // invitee joins a list right after registering, and the members
        // screen shows names, not e-mail addresses.
        options: {
          userAttributes: { name: args.name },
          autoSignIn: true,
        },
      })
      dispatch(signUpSucceeded({ email: args.email }))
    } catch (error) {
      dispatch(signUpFailed({ error: toErrorMessage(error) }))
    }
  }

export const performConfirmSignUp =
  (args: { readonly email: string; readonly code: string }) =>
  async (dispatch: AppDispatch) => {
    try {
      await confirmSignUp({
        username: args.email,
        confirmationCode: args.code,
      })
      // signUp asked for autoSignIn, so the freshly confirmed account is
      // signed in here — without it the invitee would have to retype the
      // password they just chose before the invite link continues.
      await autoSignIn()
      dispatch(signInSucceeded({ user: await fetchCurrentAuthUser() }))
      dispatch(confirmSignUpSucceeded())
      // Same reason as in performSignIn: beforeLoad only starts the engine
      // on boot, an in-session sign-in has to trigger it here.
      startSync()
    } catch (error) {
      dispatch(confirmSignUpFailed({ error: toErrorMessage(error) }))
    }
  }

export const performForgotPassword =
  (args: { readonly email: string }) => async (dispatch: AppDispatch) => {
    try {
      await resetPassword({ username: args.email })
      dispatch(forgotPasswordCodeSent({ email: args.email }))
    } catch (error) {
      dispatch(forgotPasswordFailed({ error: toErrorMessage(error) }))
    }
  }

export const performResetPassword =
  (args: {
    readonly email: string
    readonly code: string
    readonly newPassword: string
  }) =>
  async (dispatch: AppDispatch) => {
    try {
      await confirmResetPassword({
        username: args.email,
        confirmationCode: args.code,
        newPassword: args.newPassword,
      })
      dispatch(resetPasswordSucceeded())
    } catch (error) {
      dispatch(resetPasswordFailed({ error: toErrorMessage(error) }))
    }
  }

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
    dispatch(signedOut())
  }
}

/**
 * Persists the display name. Called when the profile's name field loses
 * focus. Without this the attribute never reaches Cognito, and every
 * member on the members screen would show a fallback instead of a name.
 */
export const performChangeDisplayName =
  (args: { readonly name: string }) => async (dispatch: AppDispatch) => {
    const name = args.name.trim()
    if (name === '') return
    try {
      await updateUserAttributes({ userAttributes: { name } })
      dispatch(displayNameChanged({ name }))
    } catch (error) {
      console.warn('changing the display name failed', error)
    }
  }
