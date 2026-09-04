import { describe, expect, test, vi, beforeEach } from 'vitest'

// vi.hoisted: the mock factory below is hoisted above these definitions.
const { engineStart, engineOpenLocalLog } = vi.hoisted(() => ({
  engineStart: vi.fn(() => Promise.resolve()),
  engineOpenLocalLog: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/app/sync/syncEngine', () => ({
  syncEngine: {
    start: engineStart,
    openLocalLog: engineOpenLocalLog,
    // The store's syncMiddleware offers every dispatch to the engine.
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

import { store } from '@/app/store'
import { selectInitialSyncDone } from '@/app/appSlice'
import { guestIdentityCreated } from '@/features/auth/domain/authSlice'
import { openLocalLog, startSync } from '@/app/sync/startSync'

describe('the binary sync rule', () => {
  beforeEach(() => {
    engineStart.mockClear()
    engineOpenLocalLog.mockClear()
  })

  // Without an identity there is no account and no server contact at all —
  // events wait in the outbox.
  test('does not start the engine without an identity', () => {
    startSync()
    expect(engineStart).not.toHaveBeenCalled()
  })

  // The boot skeleton waits for the first sync; a device that will never
  // sync would keep it on screen forever, hiding the "new list" card.
  test('a device without identity is done waiting for the server', () => {
    startSync()
    expect(selectInitialSyncDone(store.getState())).toBe(true)
  })

  // The queue has to load and persist regardless: before the first account
  // it IS the local event log, and it must survive a restart.
  test('opens the local log even without an identity', async () => {
    await openLocalLog()
    expect(engineOpenLocalLog).toHaveBeenCalledTimes(1)
    expect(engineStart).not.toHaveBeenCalled()
  })

  test('starts the engine once an identity exists', () => {
    store.dispatch(guestIdentityCreated({ userId: 'u1', name: 'Chris' }))
    startSync()
    expect(engineStart).toHaveBeenCalledTimes(1)
  })
})
