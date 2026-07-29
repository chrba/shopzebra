import { authFetch } from '../../../app/authFetch'
import type { PayloadAction } from '../../../app/createSlice'
import { listCreated, listRenamed, listDeleted } from './listsSlice'

/**
 * Fire-and-forget until the outbox exists (sync-engine.md §9, step 5):
 * failures are logged, the optimistic local state stays. The wire format
 * is the action itself — { type, payload, meta } (domain-model.md §8).
 */
function postEvent(
  path: string,
  type: string,
  payload: unknown,
  meta: PayloadAction<unknown>['meta'],
): Promise<void> {
  return authFetch(path, {
    method: 'POST',
    body: JSON.stringify({ type, payload, meta }),
  })
    .then((response) => {
      if (!response.ok) {
        console.warn(`sync failed (${response.status}) for ${type}`)
      }
    })
    .catch((error: unknown) => {
      console.warn(`sync failed for ${type}`, error)
    })
}

/**
 * Sends list changes to the backend after every relevant action.
 * Called by syncMiddleware; server-originated actions (meta.remote)
 * are already filtered out there.
 */
export function listsSyncHandler(
  action: PayloadAction<unknown>,
): Promise<void> | null {
  // listCreated is a class-2 command: POST /lists bootstraps ownership
  // server-side. The wire payload names the creator createdBy.
  if (listCreated.match(action)) {
    const { listId, name, ownerId } = action.payload
    return postEvent(
      '/lists',
      'lists/listCreated',
      { listId, name, createdBy: ownerId },
      action.meta,
    )
  }
  if (listRenamed.match(action)) {
    return postEvent(
      `/lists/${action.payload.listId}/events`,
      'lists/listRenamed',
      action.payload,
      action.meta,
    )
  }
  if (listDeleted.match(action)) {
    return postEvent(
      `/lists/${action.payload.listId}/events`,
      'lists/listDeleted',
      action.payload,
      action.meta,
    )
  }
  return null
}
