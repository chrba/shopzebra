// Composition root of the engine: real storage, real transport, real
// store — plus the reconnect triggers. The subscription-less stage-1
// receive path is the cursor catch-up on start, resume and reconnect
// (sync-engine.md, mobile constraints).

import { App as CapacitorApp } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { store } from '../store'
import { getItem, setItem, removeItem } from '../clientStorage'
import { initialSyncCompleted } from '../appSlice'
import { syncEngine } from './syncEngine'
import { fetchEventsSince, fetchListIds, sendEntry } from './transport'

const SYNC_STORAGE_KEY = 'shopzebra_sync'

// beforeLoad (app boot) and performSignIn (in-session sign-in) can both
// race to start the engine — it must only ever run once per signed-in
// session. stopSync() resets this so a later sign-in restarts it.
let started = false

// Capacitor listeners must survive sign-out/sign-in cycles without
// duplicating — registered at most once per app lifetime, independent
// of how many times the engine itself is started and stopped.
let listenersRegistered = false

export function startSync(): void {
  if (started) return
  started = true

  void syncEngine
    .start({
      storage: { getItem, setItem },
      dispatch: (action) => store.dispatch(action),
      send: sendEntry,
      fetchListIds,
      fetchEventsSince,
    })
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

// Counterpart to startSync(): stops the engine (see SyncEngine.stop())
// and drops its persisted queue/cursor so a signed-out session can
// never resume sending, and so the next user on this device doesn't
// inherit a stale outbox.
export async function stopSync(): Promise<void> {
  started = false
  syncEngine.stop()
  await removeItem(SYNC_STORAGE_KEY)
}
