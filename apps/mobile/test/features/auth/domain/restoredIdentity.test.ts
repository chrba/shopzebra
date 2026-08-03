import { describe, expect, test } from 'vitest'
import { restoredIdentity } from '@/features/auth/domain/restoredIdentity'

describe('restoredIdentity', () => {
  // A session without an email belongs to a shadow account — the user never
  // registered anything, the app did.
  test('a session without email is a guest', () => {
    expect(restoredIdentity('sub-1', { name: 'Chris' })).toEqual({
      kind: 'guest',
      userId: 'sub-1',
      name: 'Chris',
    })
  })

  test('a session with an email is linked', () => {
    expect(
      restoredIdentity('sub-1', { email: 'c@example.com', name: 'Chris' }),
    ).toMatchObject({ kind: 'linked', email: 'c@example.com' })
  })

  test('a missing name stays empty, not undefined', () => {
    expect(restoredIdentity('sub-1', {})).toEqual({
      kind: 'guest',
      userId: 'sub-1',
      name: '',
    })
  })

  test('the provider of the session decides how it was linked', () => {
    expect(
      restoredIdentity('sub-1', {
        email: 'c@example.com',
        provider: 'google',
      }),
    ).toMatchObject({ provider: 'google' })
  })
})
