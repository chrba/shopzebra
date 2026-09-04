import { setItem } from '../../../app/clientStorage'
import { isEventsConfirmed } from '../../../app/sync/withSync'
import { identityAttached } from '../../auth/domain/authSlice'
import { recipeDropped, recipeOwnerNamesLoaded } from './recipesSlice'
import type { Recipe } from './recipesDomain'

type RecipesState = {
  readonly recipes: readonly Recipe[]
}

export const RECIPES_KEY = 'shopzebra_recipes'

/**
 * Persists the CONFIRMED recipes tree whenever a server batch folded in.
 * Called by clientStorageMiddleware after each dispatch. Optimistic local
 * events are deliberately not persisted here — they survive restarts via
 * the outbox queue and are replayed through pendingRestored.
 */
export function recipesClientStorageHandler(
  action: { readonly type: string; readonly payload?: unknown },
  getState: () => unknown,
): void {
  // Docking rewrites the confirmed tree in place; without this the
  // sentinel would come back on the next start. Owner names come from
  // GET /recipes rather than from an event, and are just as needed on
  // disk — otherwise a restart shows "Mitglied" until the network answers.
  if (
    !isEventsConfirmed(action) &&
    !identityAttached.match(action) &&
    !recipeDropped.match(action) &&
    !recipeOwnerNamesLoaded.match(action)
  ) {
    return
  }
  const state = getState() as {
    readonly sync: { readonly confirmed: { readonly recipes: RecipesState } }
  }
  void setItem(RECIPES_KEY, JSON.stringify(state.sync.confirmed.recipes.recipes))
}
