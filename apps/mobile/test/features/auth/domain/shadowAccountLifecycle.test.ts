import { describe, expect, test, vi, beforeEach } from 'vitest'

// vi.hoisted: the mock factories below are hoisted above these definitions.
const { signIn, signUp, updateUserAttributes, storage } = vi.hoisted(() => ({
  signIn: vi.fn(() => Promise.resolve()),
  signUp: vi.fn(() => Promise.resolve()),
  updateUserAttributes: vi.fn(() => Promise.resolve()),
  storage: new Map<string, string>(),
}))

vi.mock('aws-amplify/auth', () => ({ signIn, signUp, updateUserAttributes }))
vi.mock('@/app/clientStorage', () => ({
  getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value)
    return Promise.resolve()
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key)
    return Promise.resolve()
  }),
}))

import {
  SHADOW_CREDENTIALS_KEY,
  ensureShadowAccount,
  ensureShadowCredentials,
  forgetShadowCredentials,
  restoreShadowSession,
} from '@/features/auth/domain/shadowAccount'

/** The blob as the device would find it at the next boot. */
function storedBlob(): { accountCreated?: unknown } {
  const raw = storage.get(SHADOW_CREDENTIALS_KEY)
  if (raw === undefined) throw new Error('no credentials stored')
  return JSON.parse(raw) as { accountCreated?: unknown }
}

function userNotFound(): Error {
  const error = new Error('User does not exist.')
  error.name = 'UserNotFoundException'
  return error
}

describe('shadow credentials lifecycle', () => {
  beforeEach(() => {
    storage.clear()
    signIn.mockReset()
    signUp.mockReset()
    updateUserAttributes.mockReset()
    signIn.mockImplementation(() => Promise.resolve())
    signUp.mockImplementation(() => Promise.resolve())
    updateUserAttributes.mockImplementation(() => Promise.resolve())
  })

  // The username minted at the first boot is the device's id for good.
  test('ensureShadowCredentials mints once and returns the same username', async () => {
    const first = await ensureShadowCredentials()
    const second = await ensureShadowCredentials()

    expect(first.username).toBe(second.username)
    expect(first.accountCreated).toBe(false)
  })

  // Fresh device: Cognito does not know the user, so the share signs it up
  // under the stored username and marks the account as created.
  test('ensureShadowAccount signs up under the stored username when Cognito does not know it', async () => {
    const { username, password } = await ensureShadowCredentials()
    signIn
      .mockImplementationOnce(() => Promise.reject(userNotFound()))
      .mockImplementationOnce(() => Promise.resolve())

    await ensureShadowAccount('Naschzebra')

    expect(signUp).toHaveBeenCalledTimes(1)
    expect(signUp).toHaveBeenCalledWith({
      username,
      password,
      options: { userAttributes: { name: 'Naschzebra' } },
    })
    expect(signIn).toHaveBeenCalledTimes(2)
    expect(storedBlob().accountCreated).toBe(true)
  })

  // The sign-up landed but the mark did not: the sign-in finds the account
  // and only the mark is repaired — no second sign-up, no collision.
  test('ensureShadowAccount heals a lost mark without signing up again', async () => {
    await ensureShadowCredentials()

    await ensureShadowAccount()

    expect(signUp).not.toHaveBeenCalled()
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(storedBlob().accountCreated).toBe(true)
  })

  // A device that never shared has nothing to restore and talks to nobody.
  test('restoreShadowSession makes no network call without an account', async () => {
    await ensureShadowCredentials()

    expect(await restoreShadowSession()).toBe(false)
    expect(signIn).not.toHaveBeenCalled()
    expect(signUp).not.toHaveBeenCalled()
    expect(updateUserAttributes).not.toHaveBeenCalled()
  })

  // A mark that was never written left the device signed out for everything
  // but sharing: every command collected a 401 and the outbox filled up. A
  // cursor proves the server once answered, so the sign-in happens anyway.
  test('restoreShadowSession signs in when prior sync vouches for the account', async () => {
    await ensureShadowCredentials()

    expect(await restoreShadowSession(() => Promise.resolve(true))).toBe(true)
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signUp).not.toHaveBeenCalled()
    expect(storedBlob().accountCreated).toBe(true)
  })

  // Sign-out takes the id along; the device goes on under a fresh one.
  test('forgetting the credentials yields a different username next time', async () => {
    const before = await ensureShadowCredentials()

    await forgetShadowCredentials()
    const after = await ensureShadowCredentials()

    expect(after.username).not.toBe(before.username)
    expect(after.accountCreated).toBe(false)
  })
})
