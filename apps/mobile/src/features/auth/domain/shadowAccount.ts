// The credentials minted at the first start ARE this device's identity: the
// username is the user id every event carries, and it doubles as the Cognito
// username of the shadow account once one is needed. Whether that account
// exists is only a cached mark — the share path heals a lost one by signing in
// first and signing up only when Cognito does not know the user.

import { signUp, signIn, updateUserAttributes } from 'aws-amplify/auth'
import { getItem, removeItem, setItem } from '../../../app/clientStorage'

export const SHADOW_CREDENTIALS_KEY = 'shopzebra_shadow_credentials'

export type ShadowCredentials = {
  readonly username: string
  readonly password: string
  /** Set once Cognito confirmed the sign-up. A lost mark only costs one extra sign-in attempt at the next share. */
  readonly accountCreated: boolean
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

/** Mints a fresh username and password — the username becomes a user id. */
export function generateShadowCredentials(): Omit<
  ShadowCredentials,
  'accountCreated'
> {
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

/**
 * The stored credentials, or null when absent or damaged. A blob that has a
 * username and password but no mark still carries the id — it is read with
 * the mark unset rather than thrown away.
 */
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
    const accountCreated =
      'accountCreated' in parsed && typeof parsed.accountCreated === 'boolean'
        ? parsed.accountCreated
        : false
    return {
      username: parsed.username,
      password: parsed.password,
      accountCreated,
    }
  }
  return null
}

async function persist(credentials: ShadowCredentials): Promise<void> {
  await setItem(SHADOW_CREDENTIALS_KEY, JSON.stringify(credentials))
}

/** Called once per boot. Loads the stored credentials or mints them — the username becomes this device's user id for good. */
export async function ensureShadowCredentials(): Promise<ShadowCredentials> {
  const stored = await loadShadowCredentials()
  if (stored !== null) return stored

  const minted: ShadowCredentials = {
    ...generateShadowCredentials(),
    accountCreated: false,
  }
  await persist(minted)
  return minted
}

/** Called on sign-out: the account takes its id along, the next boot/share mints a fresh one. */
export async function forgetShadowCredentials(): Promise<void> {
  await removeItem(SHADOW_CREDENTIALS_KEY)
}

/** Amplify v6 reports an unknown user by this error name — never by message text. */
function isUserNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'UserNotFoundException'
  )
}

/**
 * Called at the first share or join. Signs in; when Cognito does not know the
 * user yet, signs it up under the stored username first. Idempotent and
 * self-healing: a sign-up whose mark was never stored is found by the sign-in.
 *
 * The display name is written to the Cognito `name` attribute: the server
 * reads it when it writes listMemberAdded, and a shadow account has no
 * other source.
 */
export async function ensureShadowAccount(name?: string): Promise<void> {
  const credentials = await ensureShadowCredentials()
  const { username, password } = credentials
  const displayName = name?.trim() ?? ''

  try {
    await signIn({ username, password })
    if (displayName !== '') {
      await updateUserAttributes({ userAttributes: { name: displayName } })
    }
  } catch (error: unknown) {
    if (!isUserNotFound(error)) throw error
    await signUp({
      username,
      password,
      ...(displayName === ''
        ? {}
        : { options: { userAttributes: { name: displayName } } }),
    })
    await signIn({ username, password })
  }

  if (!credentials.accountCreated) {
    await persist({ ...credentials, accountCreated: true })
  }
}

/**
 * Called at boot when the token cache is gone. Signs the stored credentials
 * back in and reports whether there was a session to restore.
 *
 * `accountCreated` is a cache of a Cognito fact, not the fact itself, so it
 * is not the only thing that may vouch for the account: a lost mark used to
 * leave the device silently signed out for everything except sharing, which
 * is the one path that heals it. Everything else — leaving a list, removing
 * a member, the whole sync cycle — then ran without a token and collected
 * 401s while the outbox filled up.
 *
 * A device that never shared still makes no network call: without the mark
 * and without other proof, there is nothing to sign in to.
 *
 * @param accountIsVouchedFor Other evidence that the account exists, asked
 *   only when the mark is missing. The boot passes prior server contact.
 */
export async function restoreShadowSession(
  accountIsVouchedFor: () => Promise<boolean> = () => Promise.resolve(false),
): Promise<boolean> {
  const credentials = await ensureShadowCredentials()
  if (!credentials.accountCreated && !(await accountIsVouchedFor())) {
    return false
  }

  try {
    await signIn({
      username: credentials.username,
      password: credentials.password,
    })
  } catch (error: unknown) {
    // Vouched for but unknown to Cognito: the evidence was stale, not a
    // reason to keep retrying every boot. The device carries on locally.
    if (isUserNotFound(error)) return false
    throw error
  }

  // The sign-in just proved what the mark failed to record.
  if (!credentials.accountCreated) {
    await persist({ ...credentials, accountCreated: true })
  }
  return true
}
