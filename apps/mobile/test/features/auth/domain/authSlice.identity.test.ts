import { describe, expect, test } from 'vitest'
import {
  authReducer,
  deviceIdentified,
  guestIdentityCreated,
  identityLinked,
  displayNameChanged,
  identityCleared,
  selectIdentity,
  selectHasAccount,
  selectIsGuest,
  selectDisplayName,
  selectCurrentUserId,
} from '@/features/auth/domain/authSlice'

const fold = (actions: readonly { type: string }[]) =>
  actions.reduce(
    (state, action) => authReducer(state, action),
    authReducer(undefined, { type: '@@INIT' }),
  )

describe('identity', () => {
  test('starts local — the device has an id, nobody owes an account', () => {
    const auth = fold([
      deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' }),
    ])
    expect(selectHasAccount({ auth })).toBe(false)
    expect(selectIsGuest({ auth })).toBe(false)
    expect(selectCurrentUserId({ auth })).toBe('dev-1')
    expect(selectDisplayName({ auth })).toBe('Naschzebra')
  })

  // The account is created under the id the device already had.
  test('becomes a guest with the same id when the shadow account exists', () => {
    const auth = fold([
      deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' }),
      guestIdentityCreated({ userId: 'dev-1', name: 'Chris' }),
    ])
    expect(selectHasAccount({ auth })).toBe(true)
    expect(selectIsGuest({ auth })).toBe(true)
    expect(selectDisplayName({ auth })).toBe('Chris')
    expect(selectCurrentUserId({ auth })).toBe('dev-1')
  })

  // Linking must not mint a new identity — the userId is the whole point.
  test('linking keeps the userId and stops being a guest', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      identityLinked({ email: 'chris@example.com', provider: 'email' }),
    ])
    expect(selectIsGuest({ auth })).toBe(false)
    expect(selectIdentity({ auth })).toMatchObject({
      kind: 'linked',
      userId: 'u1',
    })
  })

  test('renaming works in every state', () => {
    const auth = fold([
      deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' }),
      displayNameChanged({ name: 'Christian' }),
    ])
    expect(selectDisplayName({ auth })).toBe('Christian')
  })

  // Signing out ends the account; the device goes on under a fresh id, or
  // the next share would collide with the username that just left.
  test('clearing returns to local under a new id, keeping the name', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      identityCleared({ userId: 'dev-2' }),
    ])
    expect(selectHasAccount({ auth })).toBe(false)
    expect(selectCurrentUserId({ auth })).toBe('dev-2')
    expect(selectDisplayName({ auth })).toBe('Chris')
  })
})
