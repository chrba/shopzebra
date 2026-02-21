import { fetchAuthSession } from 'aws-amplify/auth'
import type { CreateListPayload } from './listsSlice'

// REST API Endpoints (see architecture/design-decisions.md):
// POST  /lists                      → Create list
// POST  /lists/{id}/events          → Append event
// GET   /lists/{id}/events?since=t  → Fetch events since timestamp
// GET   /lists/{id}                 → Load materialized state

const API_BASE_URL = '' // TODO: set when backend is deployed

export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session = await fetchAuthSession()
  const token = session.tokens?.accessToken?.toString()

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

export async function postList(_payload: CreateListPayload): Promise<void> {
  // TODO: authFetch('/lists', { method: 'POST', body: JSON.stringify(payload) })
}

export async function postListDeletedEvent(_listId: string): Promise<void> {
  // TODO: authFetch(`/lists/${listId}/events`, { method: 'POST', body: JSON.stringify({ type: 'LIST_DELETED' }) })
}
