import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import {
  eventsConfirmed,
  pendingDiscarded,
  pendingRestored,
  withSync,
  type ConfirmedEvent,
  type SyncState,
} from '@/app/sync/withSync'

// Minimal replay-pure, total domain: quantities per item plus a local-only
// theme value. Mirrors the real split synced-domain vs. local state.
type Cart = {
  readonly quantityByItem: { readonly [itemId: string]: number }
  readonly theme: string
}

const initialCart: Cart = { quantityByItem: {}, theme: 'light' }

function isQuantitySet(
  action: PayloadAction<unknown>,
): action is PayloadAction<{ readonly itemId: string; readonly quantity: number }> {
  return action.type === 'cart/quantitySet'
}

function isThemeSet(
  action: PayloadAction<unknown>,
): action is PayloadAction<{ readonly theme: string }> {
  return action.type === 'app/themeSet'
}

function cartReducer(
  state: Cart = initialCart,
  action: PayloadAction<unknown>,
): Cart {
  if (isQuantitySet(action)) {
    const { itemId, quantity } = action.payload
    return {
      ...state,
      quantityByItem: { ...state.quantityByItem, [itemId]: quantity },
    }
  }
  if (isThemeSet(action)) {
    return { ...state, theme: action.payload.theme }
  }
  return state
}

const isSynced = (action: PayloadAction<unknown>): boolean =>
  action.type.startsWith('cart/')

function quantitySet(
  quantity: number,
  eventId: string,
): PayloadAction<{ readonly itemId: string; readonly quantity: number }> {
  return {
    type: 'cart/quantitySet',
    payload: { itemId: 'milk', quantity },
    meta: { eventId, deviceId: 'device-under-test' },
  }
}

function confirmed(quantity: number, eventId: string, position: string): ConfirmedEvent {
  return {
    type: 'cart/quantitySet',
    payload: { itemId: 'milk', quantity },
    meta: {
      eventId,
      deviceId: 'any-device',
      userId: 'any-user',
      position,
    },
  }
}

const reduce = withSync(cartReducer, isSynced)

function freshState(): SyncState<Cart> {
  return reduce(undefined, { type: '@@INIT', payload: undefined })
}

describe('withSync', () => {
  it('initializes both trees from the root reducer', () => {
    const state = freshState()
    expect(state.confirmed).toEqual(initialCart)
    expect(state.visible).toEqual(initialCart)
    expect(state.pending).toEqual([])
  })

  it('applies a synced action optimistically: visible yes, confirmed no, pending grows', () => {
    const state = reduce(freshState(), quantitySet(2, 'e1'))
    expect(state.visible.quantityByItem.milk).toBe(2)
    expect(state.confirmed.quantityByItem.milk).toBeUndefined()
    expect(state.pending).toHaveLength(1)
  })

  it('applies a non-synced action to BOTH trees so no rebase can erase it', () => {
    const local: PayloadAction<unknown> = {
      type: 'app/themeSet',
      payload: { theme: 'dark' },
      meta: { eventId: 'x', deviceId: 'device-under-test' },
    }
    const state = reduce(freshState(), local)
    expect(state.visible.theme).toBe('dark')
    expect(state.confirmed.theme).toBe('dark')
    expect(state.pending).toEqual([])

    // Survives a rebase triggered by a foreign confirmation.
    const after = reduce(state, eventsConfirmed([confirmed(5, 'f1', '07')]))
    expect(after.visible.theme).toBe('dark')
  })

  it('removes an own confirmed event from pending without changing the value', () => {
    const optimistic = reduce(freshState(), quantitySet(2, 'e1'))
    const acked = reduce(optimistic, eventsConfirmed([confirmed(2, 'e1', '07')]))
    expect(acked.pending).toEqual([])
    expect(acked.confirmed.quantityByItem.milk).toBe(2)
    expect(acked.visible.quantityByItem.milk).toBe(2)
  })

  it('converges: both devices end at the server order, not their own order', () => {
    // Canonical log: position 07 = qty 5, position 08 = qty 2.
    // Device A dispatched qty 2 (later position), device B qty 5.
    const deviceA = reduce(freshState(), quantitySet(2, 'a1'))
    const deviceB = reduce(freshState(), quantitySet(5, 'b1'))

    const log = [confirmed(5, 'b1', '07'), confirmed(2, 'a1', '08')]
    const finalA = reduce(deviceA, eventsConfirmed(log))
    const finalB = reduce(deviceB, eventsConfirmed(log))

    expect(finalA.visible.quantityByItem.milk).toBe(2)
    expect(finalB.visible.quantityByItem.milk).toBe(2)
    expect(finalA.confirmed).toEqual(finalB.confirmed)
  })

  it('rebases: a foreign confirmation slides UNDER the own pending event', () => {
    const optimistic = reduce(freshState(), quantitySet(2, 'mine'))
    // Foreign event is confirmed first — own event is still pending.
    const state = reduce(optimistic, eventsConfirmed([confirmed(5, 'theirs', '07')]))
    expect(state.confirmed.quantityByItem.milk).toBe(5)
    // Own pending intent stays on top until the server orders it.
    expect(state.visible.quantityByItem.milk).toBe(2)
    expect(state.pending).toHaveLength(1)
  })

  it('folds an out-of-order batch in position order', () => {
    const log = [confirmed(2, 'later', '08'), confirmed(5, 'earlier', '07')]
    const state = reduce(freshState(), eventsConfirmed(log))
    expect(state.confirmed.quantityByItem.milk).toBe(2)
  })

  it('ignores an empty confirmation batch without touching references', () => {
    const before = reduce(freshState(), quantitySet(2, 'e1'))
    const after = reduce(before, eventsConfirmed([]))
    expect(after).toBe(before)
  })

  it('restores pending after a restart and replays it over confirmed', () => {
    const restarted = reduce(
      freshState(),
      eventsConfirmed([confirmed(5, 'foreign', '07')]),
    )
    const state = reduce(restarted, pendingRestored([quantitySet(2, 'queued')]))
    expect(state.pending).toHaveLength(1)
    expect(state.visible.quantityByItem.milk).toBe(2)
    expect(state.confirmed.quantityByItem.milk).toBe(5)
  })

  it('does not restore an action that is already pending', () => {
    const optimistic = reduce(freshState(), quantitySet(2, 'e1'))
    const state = reduce(optimistic, pendingRestored([quantitySet(2, 'e1')]))
    expect(state.pending).toHaveLength(1)
  })

  it('discards a rejected pending event and rolls its effect back from visible', () => {
    const optimistic = reduce(freshState(), quantitySet(2, 'e1'))
    const state = reduce(optimistic, pendingDiscarded('e1'))
    expect(state.pending).toEqual([])
    expect(state.visible.quantityByItem.milk).toBeUndefined()
    expect(state.visible).toEqual(state.confirmed)
  })

  it('replay is deterministic: the same confirmations fold to the same state', () => {
    const log = [confirmed(5, 'f1', '07'), confirmed(2, 'f2', '08')]
    const once = reduce(freshState(), eventsConfirmed(log))
    const again = reduce(freshState(), eventsConfirmed(log))
    expect(once.confirmed).toEqual(again.confirmed)
    expect(once.visible).toEqual(again.visible)
  })
})
