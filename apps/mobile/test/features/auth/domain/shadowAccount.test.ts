import { describe, expect, test } from 'vitest'
import { generateShadowCredentials } from '@/features/auth/domain/shadowAccount'

describe('generateShadowCredentials', () => {
  test('produces a distinct username every time', () => {
    const first = generateShadowCredentials()
    const second = generateShadowCredentials()
    expect(first.username).not.toBe(second.username)
  })

  // Cognito's default policy rejects a password without all four classes,
  // and a rejected sign-up would strand the user with no account at all.
  test('password satisfies the default Cognito policy', () => {
    const { password } = generateShadowCredentials()
    expect(password.length).toBeGreaterThanOrEqual(16)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[!@#$%^&*]/)
  })

  // The username must never look like an email: in a pool with email as an
  // alias Cognito rejects such usernames.
  test('username is not email-shaped', () => {
    expect(generateShadowCredentials().username).not.toContain('@')
  })
})
