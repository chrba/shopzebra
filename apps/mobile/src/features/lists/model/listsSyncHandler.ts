import { listCreated, listDeleted } from './listsSlice'
// import { authFetch } from '../../../app/authFetch'

async function postList(_payload: {
  readonly id: string
  readonly name: string
  readonly memberIds: readonly string[]
}): Promise<void> {
  // TODO: authFetch('/lists', { method: 'POST', body: JSON.stringify(payload) })
}

async function postListDeletedEvent(_listId: string): Promise<void> {
  // TODO: authFetch(`/lists/${listId}/events`, { method: 'POST', body: JSON.stringify({ type: 'LIST_DELETED' }) })
}

/**
 * Sends list changes to the backend API after every relevant action.
 * Called by syncMiddleware (app/syncMiddleware.ts)
 * which runs after each dispatch.
 * Actions tagged with meta.remote (from server) are skipped by the middleware.
 */
export function listsSyncHandler(
  action: { readonly type: string; readonly payload?: unknown },
): Promise<void> | null {
  if (listCreated.match(action)) return postList(action.payload)
  if (listDeleted.match(action)) return postListDeletedEvent(action.payload.listId)
  return null
}
