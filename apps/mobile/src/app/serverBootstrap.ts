// The pull side of sync: on app start, rebuild domain state from the
// server log — state IS fold(events) (conflict-resolution.md §3).
// The push side (fire-and-forget POST per action) lives in syncMiddleware.
//
// Flow (sync-engine.md §4, per-list cursors):
//   GET /lists                     → which lists am I a member of?
//   GET /lists/{id}/events         → whole log per list (no cursor yet —
//                                     the outbox/cursor comes with stage 1)
//   dispatch every event as remote → reducers fold in server order
//
// Returns true when the server was reachable and state was hydrated;
// the caller then skips local hydration. Without an outbox the server
// log is the only truth we can trust — local-only changes made while
// offline are not merged back yet.

import { store } from './store'
import { authFetch } from './authFetch'
import { listsLoaded } from '../features/lists/domain/listsSlice'
import { shoppingLoaded } from '../features/shopping/domain/shoppingSlice'

type WireEvent = {
  readonly type: string
  readonly payload: Record<string, unknown>
  readonly meta: Record<string, unknown>
}

function isWireEvent(candidate: unknown): candidate is WireEvent {
  if (candidate === null || typeof candidate !== 'object') return false
  const event = candidate as { readonly type?: unknown; readonly payload?: unknown }
  return typeof event.type === 'string' && typeof event.payload === 'object'
}

/**
 * The wire spec (services/events.md) names the creator `createdBy`,
 * the frontend domain calls it `ownerId`. Translated here at the edge —
 * the mirror of the translation in listsSyncHandler. Goes away once the
 * two names are aligned.
 */
function toLocalPayload(event: WireEvent): Record<string, unknown> {
  if (event.type !== 'lists/listCreated') return event.payload
  const { createdBy, ...rest } = event.payload
  return { ...rest, ownerId: createdBy }
}

function foldServerEvent(event: WireEvent): void {
  store.dispatch({
    type: event.type,
    payload: toLocalPayload(event),
    // remote: syncMiddleware must not post it back, eventIdMiddleware
    // must not stamp a fresh eventId over the original one.
    meta: { ...event.meta, remote: true },
  })
}

async function fetchListLog(listId: string): Promise<readonly WireEvent[]> {
  const response = await authFetch(`/lists/${listId}/events`)
  if (!response.ok) throw new Error(`GET /lists/${listId}/events → ${response.status}`)
  const body: unknown = await response.json()
  const events = (body as { readonly events?: unknown }).events
  if (!Array.isArray(events)) throw new Error('events response is not a list')
  return events.filter(isWireEvent)
}

// beforeLoad can run concurrently (React StrictMode double-invokes in
// dev, route re-entry). Two interleaved bootstraps fold every event
// twice — so all callers share a single run per app start.
let bootstrapRun: Promise<boolean> | null = null

export function hydrateFromServer(): Promise<boolean> {
  bootstrapRun ??= rebuildStateFromServerLog()
  return bootstrapRun
}

async function rebuildStateFromServerLog(): Promise<boolean> {
  try {
    const listsResponse = await authFetch('/lists')
    if (!listsResponse.ok) {
      console.warn(`server bootstrap skipped: GET /lists → ${listsResponse.status}`)
      return false
    }
    const body: unknown = await listsResponse.json()
    const listIds = (body as { readonly lists?: unknown }).lists
    if (!Array.isArray(listIds)) return false

    const logs = await Promise.all(
      listIds.filter((id): id is string => typeof id === 'string').map(fetchListLog),
    )

    // Start from empty, then fold every log in server order — a plain
    // deterministic fold, no merge logic (conflict-resolution.md §3).
    store.dispatch(listsLoaded({ lists: [] }))
    store.dispatch(shoppingLoaded({ itemsByListId: {}, customVariantsByListId: {} }))
    for (const log of logs) {
      for (const event of log) {
        foldServerEvent(event)
      }
    }
    return true
  } catch (error: unknown) {
    console.warn('server bootstrap failed, falling back to local state', error)
    return false
  }
}
