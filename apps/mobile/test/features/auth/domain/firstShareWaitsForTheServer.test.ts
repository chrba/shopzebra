import { describe, expect, test, vi } from 'vitest'

// A guest writes their lists locally; nothing reaches the server until the
// first share creates the account. The share that follows immediately talks
// to the server ABOUT one of those lists — so it must not overtake them.

// vi.hoisted: the mock factories below are hoisted above these definitions.
const { firstCycle, engineStart, ensureShadowAccount } = vi.hoisted(() => {
  const firstCycle = { finished: false }
  return {
    firstCycle,
    ensureShadowAccount: vi.fn(() => Promise.resolve()),
    // The engine's first cycle takes a turn of the event loop, the way a
    // POST does. A caller that does not wait is done long before it.
    engineStart: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            firstCycle.finished = true
            resolve()
          }, 0)
        }),
    ),
  }
})

vi.mock('@/features/auth/domain/shadowAccount', () => ({ ensureShadowAccount }))
vi.mock('@/app/sync/syncEngine', () => ({
  syncEngine: {
    start: engineStart,
    openLocalLog: vi.fn(() => Promise.resolve()),
    offer: vi.fn(),
    stop: vi.fn(),
    requestSync: vi.fn(() => Promise.resolve()),
  },
}))
vi.mock('@capacitor/network', () => ({
  Network: { addListener: vi.fn(() => Promise.resolve()) },
}))
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(() => Promise.resolve()) },
}))
// The store persists on every dispatch; this test has no device to write to.
vi.mock('@/app/clientStorage', () => ({
  getItem: vi.fn(() => Promise.resolve(null)),
  setItem: vi.fn(() => Promise.resolve()),
  removeItem: vi.fn(() => Promise.resolve()),
}))

import { store } from '@/app/store'
import { ensureIdentity } from '@/features/auth/domain/identityThunks'
import { deviceIdentified } from '@/features/auth/domain/authSlice'
import { listCreated } from '@/features/lists/domain/listsSlice'

describe('the first share', () => {
  // Sharing is what makes the account necessary — and the list the share is
  // about was written before it existed. Returning while its listCreated is
  // still in the outbox means the very next request (POST /lists/l1/invites)
  // asks the server about a list it has never heard of: 403, not a member.
  test('does not return before this device pushed what it wrote', async () => {
    store.dispatch(deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' }))
    store.dispatch(
      listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'dev-1' }),
    )

    await store.dispatch(ensureIdentity())

    expect(engineStart).toHaveBeenCalledTimes(1)
    expect(firstCycle.finished).toBe(true)
  })
})
