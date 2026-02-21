// Auth thunks — call Amplify, then dispatch result actions.
//
// Auth is NOT optimistic: the user is only signed in after Cognito confirms.
// That's the exception where thunks are the right tool (server response
// needed BEFORE the meaningful state update).

import {
  signIn,
  signUp,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth'
import type { AppDispatch } from '../../app/store'
import {
  signInSucceeded,
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
    } catch (error) {
      dispatch(signInFailed({ error: toErrorMessage(error) }))
    }
  }

export const performSignUp =
  (args: { readonly email: string; readonly password: string }) =>
  async (dispatch: AppDispatch) => {
    try {
      await signUp({ username: args.email, password: args.password })
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
      dispatch(confirmSignUpSucceeded())
    } catch (error) {
      dispatch(confirmSignUpFailed({ error: toErrorMessage(error) }))
    }
  }

export const performForgotPassword =
  (args: { readonly email: string }) =>
  async (dispatch: AppDispatch) => {
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
  try {
    await signOut()
  } finally {
    dispatch(signedOut())
  }
}
