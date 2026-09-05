import { describe, expect, test, vi, beforeEach } from 'vitest'

// vi.hoisted: the mock factories below are hoisted above these definitions.
const { ensureShadowAccount, startSync } = vi.hoisted(() => ({
  ensureShadowAccount: vi.fn(() => Promise.resolve()),
  startSync: vi.fn(),
}))

vi.mock('@/features/auth/domain/shadowAccount', () => ({ ensureShadowAccount }))
vi.mock('@/app/sync/syncEngine', () => ({
  syncEngine: { offer: vi.fn() },
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
  deviceIdentified,
  identityCleared,
  selectCurrentUserId,
  selectIsGuest,
} from '@/features/auth/domain/authSlice'
import { listCreated, selectListById } from '@/features/lists/domain/listsSlice'

describe('ensureIdentity', () => {
  beforeEach(() => {
    ensureShadowAccount.mockClear()
    startSync.mockClear()
    store.dispatch(identityCleared({ userId: 'dev-1' }))
    // The device identified itself at its first start; the account inherits it.
    store.dispatch(deviceIdentified({ userId: 'dev-1', name: 'Naschzebra' }))
  })

  // The account appears at the first share, under the id the device has had
  // since its first start — nothing to rewrite, nothing to order.
  test('creates the account under the device id, then starts syncing', async () => {
    await store.dispatch(ensureIdentity())

    expect(ensureShadowAccount).toHaveBeenCalledWith('Naschzebra')
    expect(selectIsGuest(store.getState())).toBe(true)
    expect(selectCurrentUserId(store.getState())).toBe('dev-1')
    expect(startSync).toHaveBeenCalledTimes(1)
  })

  // What the guest wrote already names the id the account gets.
  test('the lists written before the account already belong to it', async () => {
    store.dispatch(
      listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'dev-1' }),
    )

    await store.dispatch(ensureIdentity())

    expect(selectListById(store.getState(), 'l1')?.ownerId).toBe('dev-1')
  })

  test('is idempotent — a second call creates no second account', async () => {
    await store.dispatch(ensureIdentity())
    await store.dispatch(ensureIdentity())
    expect(ensureShadowAccount).toHaveBeenCalledTimes(1)
  })
})
