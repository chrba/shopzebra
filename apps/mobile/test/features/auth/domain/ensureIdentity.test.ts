import { describe, expect, test, vi, beforeEach } from 'vitest'

// vi.hoisted: the mock factories below are hoisted above these definitions.
const { ensureShadowAccount, rewriteQueuedAuthor, startSync } = vi.hoisted(
  () => ({
    ensureShadowAccount: vi.fn(() => Promise.resolve('sub-123')),
    rewriteQueuedAuthor: vi.fn(() => Promise.resolve()),
    startSync: vi.fn(),
  }),
)

vi.mock('@/features/auth/domain/shadowAccount', () => ({ ensureShadowAccount }))
vi.mock('@/app/sync/syncEngine', () => ({
  syncEngine: { rewriteQueuedAuthor, offer: vi.fn() },
}))
vi.mock('@/app/sync/startSync', () => ({ startSync }))
// The store persists on every dispatch; this test has no device to write to.
vi.mock('@/app/clientStorage', () => ({
  getItem: vi.fn(() => Promise.resolve(null)),
  setItem: vi.fn(() => Promise.resolve()),
  removeItem: vi.fn(() => Promise.resolve()),
}))

import { store } from '@/app/store'
import { ensureIdentity } from '@/features/auth/domain/identityThunks'
import {
  deviceNamed,
  identityCleared,
  selectCurrentUserId,
  selectIsGuest,
} from '@/features/auth/domain/authSlice'
import { listCreated, selectListById } from '@/features/lists/domain/listsSlice'

describe('ensureIdentity', () => {
  beforeEach(() => {
    ensureShadowAccount.mockClear()
    rewriteQueuedAuthor.mockClear()
    startSync.mockClear()
    store.dispatch(identityCleared())
    // The device named itself at its first start; the account inherits it.
    store.dispatch(deviceNamed({ name: 'Naschzebra' }))
  })

  // The whole point: the account appears at the first share, not at install —
  // and the queue is rewritten BEFORE the engine may flush it. The name is
  // never asked for; the account is born with the one the device carries.
  test('creates the account, rewrites the queue, then starts syncing', async () => {
    await store.dispatch(ensureIdentity())

    expect(ensureShadowAccount).toHaveBeenCalledWith('Naschzebra')
    expect(rewriteQueuedAuthor).toHaveBeenCalledWith('local-user', 'sub-123')
    expect(selectIsGuest(store.getState())).toBe(true)
    expect(selectCurrentUserId(store.getState())).toBe('sub-123')
    expect(startSync).toHaveBeenCalledTimes(1)
    // Ordering: a flush before the rewrite would ship rejected events.
    expect(rewriteQueuedAuthor.mock.invocationCallOrder[0]).toBeLessThan(
      startSync.mock.invocationCallOrder[0] ?? 0,
    )
  })

  // Everything the guest authored has to move with them, or the server
  // would refuse the create and the owner row would name a stranger.
  test('the lists written before the account belong to it afterwards', async () => {
    store.dispatch(
      listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'local-user' }),
    )

    await store.dispatch(ensureIdentity())

    expect(selectListById(store.getState(), 'l1')?.ownerId).toBe('sub-123')
  })

  test('is idempotent — a second call creates no second account', async () => {
    await store.dispatch(ensureIdentity())
    await store.dispatch(ensureIdentity())
    expect(ensureShadowAccount).toHaveBeenCalledTimes(1)
  })
})
