// Composition root of the engine: real storage, real transport, real
// store — plus the reconnect triggers. The subscription-less stage-1
// receive path is the cursor catch-up on start, resume and reconnect
// (sync-engine.md, mobile constraints).

import { App as CapacitorApp } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { store } from '../store'
import { getItem, setItem } from '../clientStorage'
import { initialSyncCompleted } from '../appSlice'
import { syncEngine } from './syncEngine'
import { fetchEventsSince, fetchListIds, sendEntry } from './transport'

// beforeLoad can run concurrently (StrictMode double-invoke) — the
// engine, listeners and initial catch-up must only ever start once.
let started = false

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

  void Network.addListener('networkStatusChange', (status) => {
    if (status.connected) syncEngine.refresh()
  })
  void CapacitorApp.addListener('appStateChange', (state) => {
    if (state.isActive) syncEngine.refresh()
  })
}
