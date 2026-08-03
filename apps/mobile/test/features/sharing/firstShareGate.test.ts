import { describe, expect, test } from 'vitest'
import { needsNameBeforeSharing } from '@/features/sharing/FirstShareNameSheet'

describe('needsNameBeforeSharing', () => {
  // Asked exactly once — a guest who already shared has a name.
  test('asks a device without identity', () => {
    expect(needsNameBeforeSharing({ kind: 'none' })).toBe(true)
  })

  test('does not ask a guest who already has a name', () => {
    expect(
      needsNameBeforeSharing({ kind: 'guest', userId: 'u1', name: 'Chris' }),
    ).toBe(false)
  })

  test('does not ask a linked account', () => {
    expect(
      needsNameBeforeSharing({
        kind: 'linked',
        userId: 'u1',
        name: 'Chris',
        email: 'c@example.com',
        provider: 'email',
      }),
    ).toBe(false)
  })
})
