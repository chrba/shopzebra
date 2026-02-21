import type { CreateListPayload } from './listsSlice'

// REST API Endpoints (see architecture/design-decisions.md):
// POST  /lists                      → Create list
// POST  /lists/{id}/events          → Append event
// GET   /lists/{id}/events?since=t  → Fetch events since timestamp
// GET   /lists/{id}                 → Load materialized state

export async function postList(_payload: CreateListPayload): Promise<void> {
  // TODO: fetch('POST', '/lists', payload)
}

export async function postListDeletedEvent(_listId: string): Promise<void> {
  // TODO: fetch('POST', `/lists/${listId}/events`, { type: 'LIST_DELETED' })
}
