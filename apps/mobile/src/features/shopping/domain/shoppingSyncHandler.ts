import { authFetch } from '../../../app/authFetch'
import type { PayloadAction } from '../../../app/createSlice'
import {
  customVariantAdded,
  itemAdded,
  itemChecked,
  itemNoteUpdated,
  itemRemoved,
  itemUnchecked,
  itemUpdated,
} from './shoppingSlice'

/**
 * Shopping actions ARE wire-format events (domain-model.md §8) — they go
 * to the generic class-1 append endpoint of their list unchanged.
 * Fire-and-forget until the outbox exists; failures are logged.
 */
function postToList(
  listId: string,
  action: PayloadAction<unknown>,
): Promise<void> {
  return authFetch(`/lists/${listId}/events`, {
    method: 'POST',
    body: JSON.stringify({
      type: action.type,
      payload: action.payload,
      meta: action.meta,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        console.warn(`sync failed (${response.status}) for ${action.type}`)
      }
    })
    .catch((error: unknown) => {
      console.warn(`sync failed for ${action.type}`, error)
    })
}

export function shoppingSyncHandler(
  action: PayloadAction<unknown>,
): Promise<void> | null {
  if (itemAdded.match(action)) return postToList(action.payload.listId, action)
  if (itemChecked.match(action)) return postToList(action.payload.listId, action)
  if (itemUnchecked.match(action)) return postToList(action.payload.listId, action)
  if (itemRemoved.match(action)) return postToList(action.payload.listId, action)
  if (itemUpdated.match(action)) return postToList(action.payload.listId, action)
  if (itemNoteUpdated.match(action)) return postToList(action.payload.listId, action)
  if (customVariantAdded.match(action)) return postToList(action.payload.listId, action)
  return null
}
