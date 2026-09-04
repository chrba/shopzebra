// Lifecycle of the engine singleton + the reconnect triggers
// (stage 1 has no push; catch-up is the receive path).

import { App as CapacitorApp } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { store, type RootState } from '../store'
import { removeItem } from '../clientStorage'
import { initialSyncCompleted } from '../appSlice'
import { selectHasIdentity } from '../../features/auth/domain/authSlice'
import { listDropped, selectAllLists } from '../../features/lists/domain/listsSlice'
import {
  recipeDropped,
  selectAllRecipes,
} from '../../features/recipes/domain/recipesSlice'
import type { Aggregate } from './aggregate'
import { syncEngine } from './syncEngine'
import { SYNC_STORAGE_KEY } from './outbox'

// Guards the boot/sign-in race: the engine runs once per identity.
let started = false

// Capacitor listeners are registered once per app lifetime — they must not
// stack across sign-out/sign-in cycles.
let listenersRegistered = false

/**
 * Called from the root beforeLoad, right after hydration and before
 * startSync. Loads the persisted queue and replays it into the reducer —
 * the outbox is the local event log even without an account, so a guest
 * finds their lists again after a restart. Contacts no server.
 */
export async function openLocalLog(): Promise<void> {
  await syncEngine.openLocalLog((action) => store.dispatch(action))
}

/**
 * Everything whose folded state this device currently holds. The engine
 * uses it for two things: deciding whether a cursor may be resumed, and
 * noticing what the server no longer shows us. Lives here because the
 * engine knows nothing about Redux.
 *
 * Depends on the boot order: hydration runs before startSync, so a restart
 * finds its trees in place. Turn that around and every log gets refetched
 * once — wasteful, never wrong, since folding twice yields the same tree.
 */
function heldAggregates(state: RootState): readonly Aggregate[] {
  return [
    ...selectAllLists(state).map(
      (list): Aggregate => ({ kind: 'list', id: list.id }),
    ),
    ...selectAllRecipes(state).map(
      (recipe): Aggregate => ({ kind: 'recipe', id: recipe.id }),
    ),
  ]
}

/**
 * Letting go of something we are no longer a member of. The same local-only
 * actions leaving uses — nothing is destroyed anywhere, this device just
 * stops holding it.
 */
function dropped(aggregate: Aggregate) {
  return aggregate.kind === 'recipe'
    ? recipeDropped({ recipeId: aggregate.id })
    : listDropped({ listId: aggregate.id })
}

/** Called from the root beforeLoad (app boot) and ensureIdentity. Idempotent. */
export function startSync(): void {
  if (started) return

  // The binary rule (accountless-first-planned.md): no identity, no server
  // contact. Nothing is on its way in either, so the boot skeleton must
  // stop waiting — otherwise it hides the "new list" card forever.
  if (!selectHasIdentity(store.getState())) {
    store.dispatch(initialSyncCompleted())
    return
  }

  started = true

  void syncEngine
    .start((action) => store.dispatch(action), {
      heldAggregates: () => heldAggregates(store.getState()),
      dropAggregate: (aggregate) => store.dispatch(dropped(aggregate)),
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

/**
 * Called from performSignOut. Stops the engine and drops its persisted
 * queue/cursor — the next user on this device inherits nothing.
 */
export async function stopSync(): Promise<void> {
  started = false
  syncEngine.stop()
  await removeItem(SYNC_STORAGE_KEY)
  // The device stays usable as a guest afterwards — without an open log
  // its next events would live in memory only and die with the reload.
  await openLocalLog()
}
