// The policy of this app: every synced slice hands in its declarations
// here, once, by name. Nothing else registers anything anywhere.

import { composeSyncPolicy } from './syncPolicy'
import { listsSyncDeclarations } from '../../features/lists/domain/listsSlice'
import { shoppingSyncDeclarations } from '../../features/shopping/domain/shoppingSlice'
import { recipesSyncDeclarations } from '../../features/recipes/domain/recipesSlice'

export const appSyncPolicy = composeSyncPolicy(
  listsSyncDeclarations,
  shoppingSyncDeclarations,
  recipesSyncDeclarations,
)
