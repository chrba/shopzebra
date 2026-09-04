// The stage-2 core (sync-engine.md §3): a higher-order reducer keeping two
// trees. `confirmed` folds the server-ordered log, `visible` is confirmed
// plus the own pending events replayed on top — the rebase. Feature
// reducers stay unchanged; all devices converge because they all fold the
// same log in the same position order.

import type { ActionMeta, PayloadAction } from '../createSlice'
import { withRewrittenAuthorFields } from './authorRewrite'

/** A root reducer as withSync expects it — total and replay-pure. */
export type RootReducer<S> = (
  state: S | undefined,
  action: PayloadAction<unknown>,
) => S

/**
 * The wrapped store state. `visible` is what selectors read; `confirmed`
 * is the local truth without pending; `pending` are own events the server
 * has not confirmed yet, in dispatch order.
 */
export type SyncState<S> = {
  readonly confirmed: S
  readonly pending: readonly PayloadAction<unknown>[]
  readonly visible: S
}

/** A server-confirmed event: a synced action whose meta carries the log position. */
export type ConfirmedEvent = {
  readonly type: string
  readonly payload: unknown
  readonly meta: ActionMeta & { readonly position: string }
}

// --- The protocol actions of the sync reducer. Each is a plain
// action-creator function plus a named type guard — nothing else.

const EVENTS_CONFIRMED = 'sync/eventsConfirmed'

type EventsConfirmedAction = {
  readonly type: typeof EVENTS_CONFIRMED
  readonly payload: { readonly events: readonly ConfirmedEvent[] }
}

/**
 * Creates the action that carries a batch of server-confirmed events into
 * the reducer. Dispatched by catch-up, one batch per aggregate. The
 * reducer sorts by position, so delivery order does not matter.
 */
export function eventsConfirmed(
  events: readonly ConfirmedEvent[],
): EventsConfirmedAction {
  return { type: EVENTS_CONFIRMED, payload: { events } }
}

/** True for eventsConfirmed actions. Used by the reducer and the storage handlers. */
export function isEventsConfirmed(action: {
  readonly type: string
}): action is EventsConfirmedAction {
  return action.type === EVENTS_CONFIRMED
}

const PENDING_RESTORED = 'sync/pendingRestored'

type PendingRestoredAction = {
  readonly type: typeof PENDING_RESTORED
  readonly payload: { readonly actions: readonly PayloadAction<unknown>[] }
}

/**
 * Creates the action that refills the pending queue after an app restart
 * (from the persisted outbox queue). Dispatched once by the engine at
 * start. Actions already pending (same eventId) are not added twice.
 */
export function pendingRestored(
  actions: readonly PayloadAction<unknown>[],
): PendingRestoredAction {
  return { type: PENDING_RESTORED, payload: { actions } }
}

/** True for pendingRestored actions. */
export function isPendingRestored(action: {
  readonly type: string
}): action is PendingRestoredAction {
  return action.type === PENDING_RESTORED
}

const PENDING_DISCARDED = 'sync/pendingDiscarded'

type PendingDiscardedAction = {
  readonly type: typeof PENDING_DISCARDED
  readonly payload: { readonly eventId: string }
}

/**
 * Creates the action that removes one pending event for good after the
 * server rejected it (4xx). Dispatched by the engine's onRejected hook.
 * The rebase then drops the event's optimistic effect from `visible`.
 */
export function pendingDiscarded(eventId: string): PendingDiscardedAction {
  return { type: PENDING_DISCARDED, payload: { eventId } }
}

/** True for pendingDiscarded actions. */
export function isPendingDiscarded(action: {
  readonly type: string
}): action is PendingDiscardedAction {
  return action.type === PENDING_DISCARDED
}

const PENDING_AUTHOR_REWRITTEN = 'sync/pendingAuthorRewritten'

type PendingAuthorRewrittenAction = {
  readonly type: typeof PENDING_AUTHOR_REWRITTEN
  readonly payload: {
    readonly previousUserId: string
    readonly userId: string
  }
}

/**
 * Creates the action that moves the pending queue to a new author, in step
 * with the outbox it mirrors. Dispatched once by ensureIdentity, after the
 * queued sends were rewritten: without it the next rebase would replay the
 * old actions and resurrect the local sentinel in the visible tree.
 */
export function pendingAuthorRewritten(
  previousUserId: string,
  userId: string,
): PendingAuthorRewrittenAction {
  return { type: PENDING_AUTHOR_REWRITTEN, payload: { previousUserId, userId } }
}

/** True for pendingAuthorRewritten actions. */
export function isPendingAuthorRewritten(action: {
  readonly type: string
}): action is PendingAuthorRewrittenAction {
  return action.type === PENDING_AUTHOR_REWRITTEN
}

function byPosition(a: ConfirmedEvent, b: ConfirmedEvent): number {
  return a.meta.position < b.meta.position ? -1 : 1
}

/**
 * Wraps the root reducer with the confirmed/pending split. `isSynced`
 * decides which actions are own domain events (they fold into `visible`
 * and wait in `pending`); everything else folds into BOTH trees — if it
 * only reached `visible`, the next rebase would erase it, because
 * `visible` is recomputed from confirmed + pending.
 */
export function withSync<S>(
  rootReducer: RootReducer<S>,
  isSynced: (action: PayloadAction<unknown>) => boolean,
) {
  return function syncReducer(
    state: SyncState<S> | undefined,
    action: PayloadAction<unknown>,
  ): SyncState<S> {
    if (state === undefined) {
      const initial = rootReducer(undefined, action)
      return { confirmed: initial, pending: [], visible: initial }
    }

    if (isEventsConfirmed(action)) {
      const incoming = [...action.payload.events].sort(byPosition)
      if (incoming.length === 0) return state
      const confirmed = incoming.reduce(rootReducer, state.confirmed)
      const confirmedEventIds = new Set(
        incoming.map((event) => event.meta.eventId),
      )
      const pending = state.pending.filter((own) => {
        const eventId = own.meta?.eventId
        return eventId === undefined || !confirmedEventIds.has(eventId)
      })
      return {
        confirmed,
        pending,
        visible: pending.reduce(rootReducer, confirmed), // the rebase
      }
    }

    if (isPendingDiscarded(action)) {
      const pending = state.pending.filter(
        (own) => own.meta?.eventId !== action.payload.eventId,
      )
      if (pending.length === state.pending.length) return state
      return {
        ...state,
        pending,
        visible: pending.reduce(rootReducer, state.confirmed),
      }
    }

    if (isPendingAuthorRewritten(action)) {
      const { previousUserId, userId } = action.payload
      const pending = state.pending.map((own) => ({
        ...own,
        payload: withRewrittenAuthorFields(
          own.payload,
          previousUserId,
          userId,
        ),
      }))
      return {
        ...state,
        pending,
        visible: pending.reduce(rootReducer, state.confirmed),
      }
    }

    if (isPendingRestored(action)) {
      const alreadyPending = new Set(
        state.pending.map((own) => own.meta?.eventId),
      )
      const restored = action.payload.actions.filter(
        (candidate) => !alreadyPending.has(candidate.meta?.eventId),
      )
      if (restored.length === 0) return state
      // Restored actions predate everything dispatched since app start.
      const pending = [...restored, ...state.pending]
      return {
        ...state,
        pending,
        visible: pending.reduce(rootReducer, state.confirmed),
      }
    }

    const visible = rootReducer(state.visible, action)
    // Only actions with an eventId can ever be confirmed and leave
    // pending again — anything else counts as local.
    // TODO: debug if thre are any events without id 
    return isSynced(action) && action.meta?.eventId !== undefined
      ? { confirmed: state.confirmed, pending: [...state.pending, action], visible }
      : { confirmed: rootReducer(state.confirmed, action), pending: state.pending, visible }
  }
}
