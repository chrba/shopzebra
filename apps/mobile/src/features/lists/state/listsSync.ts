import { listCreated, listDeleted } from './listsSlice'
import { postList, postListDeletedEvent } from './listsApi'

export function listsSyncHandler(
  action: { readonly type: string; readonly payload?: unknown },
): Promise<void> | null {
  if (listCreated.match(action)) return postList(action.payload)
  if (listDeleted.match(action)) return postListDeletedEvent(action.payload.listId)
  return null
}
