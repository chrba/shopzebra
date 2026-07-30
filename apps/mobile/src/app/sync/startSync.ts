// Lifecycle of the engine singleton + the reconnect triggers
// (stage 1 has no push; catch-up is the receive path).

import { App as CapacitorApp } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { store } from '../store'
import { removeItem } from '../clientStorage'
import { initialSyncCompleted } from '../appSlice'
import { syncEngine } from './syncEngine'
import { SYNC_STORAGE_KEY } from './outbox'

// Guards the boot/sign-in race: the engine runs once per signed-in session.
let started = false

// Capacitor listeners are registered once per app lifetime — they must not
// stack across sign-out/sign-in cycles.
let listenersRegistered = false

/** Called from the root beforeLoad (app boot) and performSignIn. Idempotent. */
export function startSync(): void {
  if (started) return
  started = true

  void syncEngine
    .start((action) => store.dispatch(action))
    .finally(() => store.dispatch(initialSyncCompleted()))
    .catch((error: unknown) => {
      console.warn('sync: start failed', error)
    })

  if (listenersRegistered) return
  listenersRegistered = true

  void Network.addListener('networkStatusChange', (status) => {
    if (status.connected) syncEngine.refresh()
  })
  void CapacitorApp.addListener('appStateChange', (state) => {
    if (state.isActive) syncEngine.refresh()
  })
}

/**
 * Called from performSignOut. Stops the engine and drops its persisted
 * queue/cursor — the next user on this device inherits nothing.
 */
export async function stopSync(): Promise<void> {
  started = false
  syncEngine.stop()
  await removeItem(SYNC_STORAGE_KEY)
}
