import { describe, expect, test } from 'vitest'
import {
  authReducer,
  guestIdentityCreated,
  identityLinked,
  displayNameChanged,
  identityCleared,
  selectIdentity,
  selectHasIdentity,
  selectIsGuest,
  selectDisplayName,
  selectCurrentUserId,
} from '@/features/auth/domain/authSlice'
import { LOCAL_USER_ID } from '@/features/auth/domain/localUser'

const fold = (actions: readonly { type: string }[]) =>
  actions.reduce(
    (state, action) => authReducer(state, action),
    authReducer(undefined, { type: '@@INIT' }),
  )

describe('identity', () => {
  test('starts as none — a fresh install owes nobody an account', () => {
    const auth = fold([])
    expect(selectHasIdentity({ auth })).toBe(false)
    expect(selectIsGuest({ auth })).toBe(false)
  })

  // Events authored before any account exists still need an author.
  test('without an identity the current user is the local sentinel', () => {
    expect(selectCurrentUserId({ auth: fold([]) })).toBe(LOCAL_USER_ID)
  })

  test('becomes a guest when the shadow account is created', () => {
    const auth = fold([guestIdentityCreated({ userId: 'u1', name: 'Chris' })])
    expect(selectHasIdentity({ auth })).toBe(true)
    expect(selectIsGuest({ auth })).toBe(true)
    expect(selectDisplayName({ auth })).toBe('Chris')
    expect(selectCurrentUserId({ auth })).toBe('u1')
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

  test('renaming works in both states', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      displayNameChanged({ name: 'Christian' }),
    ])
    expect(selectDisplayName({ auth })).toBe('Christian')
  })

  test('clearing returns to none', () => {
    const auth = fold([
      guestIdentityCreated({ userId: 'u1', name: 'Chris' }),
      identityCleared(),
    ])
    expect(selectHasIdentity({ auth })).toBe(false)
  })
})
