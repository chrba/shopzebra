// The shadow account: a normal Cognito user whose credentials the app
// invents and keeps for the user. It exists so a guest can talk to the API
// at all — see architecture/accountless-first-planned.md.

import {
  signUp,
  signIn,
  getCurrentUser,
  updateUserAttributes,
} from 'aws-amplify/auth'
import { getItem, setItem } from '../../../app/clientStorage'

export const SHADOW_CREDENTIALS_KEY = 'shopzebra_shadow_credentials'

export type ShadowCredentials = {
  readonly username: string
  readonly password: string
}

const PASSWORD_ALPHABET =
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*'

/** Random password that always contains all four character classes. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const body = Array.from(
    bytes,
    (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length],
  ).join('')
  return `${body}aA1!`
}

/** Called before the very first sign-up on this device. */
export function generateShadowCredentials(): ShadowCredentials {
  return { username: crypto.randomUUID(), password: randomPassword() }
}

/** A corrupt blob must not brick the boot — treat it as absent. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Called on app start to find out whether this device has an identity. */
export async function loadShadowCredentials(): Promise<ShadowCredentials | null> {
  const raw = await getItem(SHADOW_CREDENTIALS_KEY)
  if (raw === null) return null
  const parsed: unknown = safeParse(raw)
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'username' in parsed &&
    'password' in parsed &&
    typeof parsed.username === 'string' &&
    typeof parsed.password === 'string'
  ) {
    return { username: parsed.username, password: parsed.password }
  }
  return null
}

/**
 * Signs the device in, creating the shadow account on first use. Called at
 * the first share or join, and again at boot when the token cache is gone
 * but the credentials are still here.
 *
 * The display name is written to the Cognito `name` attribute, not just to
 * the store: the server reads it through `CognitoUserDirectory` when it
 * writes `listMemberAdded`, and a shadow account has no other source.
 */
export async function ensureShadowAccount(name?: string): Promise<string> {
  const existing = await loadShadowCredentials()
  const credentials = existing ?? generateShadowCredentials()
  const displayName = name?.trim() ?? ''

  if (existing === null) {
    // The name travels with the sign-up: the account carries it from the
    // moment it exists, before the first sign-in and long before the join
    // that reads it back. One round trip less, and one race less.
    await signUp({
      username: credentials.username,
      password: credentials.password,
      ...(displayName === ''
        ? {}
        : { options: { userAttributes: { name: displayName } } }),
    })
    // Persisted only after Cognito accepted them — credentials that belong
    // to no account would lock the device out of its own identity.
    await setItem(SHADOW_CREDENTIALS_KEY, JSON.stringify(credentials))
  }

  await signIn({
    username: credentials.username,
    password: credentials.password,
  })

  // An account that already existed carries no name from this share yet.
  if (displayName !== '' && existing !== null) {
    await updateUserAttributes({ userAttributes: { name: displayName } })
  }
  const { userId } = await getCurrentUser()
  return userId
}
