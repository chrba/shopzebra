// A refused command answers with a status, and the callers that act on it
// must read that status — not go looking for the digits in the message. The
// message names the path, and the path carries ids.

import { describe, expect, test } from 'vitest'
import type { Fetcher } from '@/app/authFetch'
import {
  CommandRefused,
  addMember,
  refusedBecauseFull,
  removeMember,
} from '@/features/sharing/memberCommands'
import { leaveList } from '@/features/lists/domain/leaveList'
import {
  listCreated,
  listsReducer,
  selectAllLists,
} from '@/features/lists/domain/listsSlice'
import type { Aggregate } from '@/app/sync/aggregate'

const groceries: Aggregate = { kind: 'list', id: 'l1' }
const meta = { eventId: 'e1', deviceId: 'd1' }

const answering =
  (status: number): Fetcher =>
  () =>
    Promise.resolve(new Response(null, { status }))

describe('a command the server turned down', () => {
  test('carries the status the server answered with', async () => {
    const refusal = await removeMember(
      groceries,
      'tom',
      meta,
      answering(500),
    ).then(
      () => null,
      (error: unknown) => error,
    )

    expect(refusal).toBeInstanceOf(CommandRefused)
    expect((refusal as CommandRefused).status).toBe(500)
  })

  test('the member cap is recognised by its status, nothing else', async () => {
    const full = await addMember(groceries, 'tom', meta, answering(409)).then(
      () => null,
      (error: unknown) => error,
    )
    const other = await addMember(groceries, 'tom', meta, answering(403)).then(
      () => null,
      (error: unknown) => error,
    )

    expect(refusedBecauseFull(full)).toBe(true)
    expect(refusedBecauseFull(other)).toBe(false)
    expect(refusedBecauseFull(new Error('POST /lists/409/members → 500'))).toBe(
      false,
    )
  })
})

// --- Leaving a list whose id happens to contain those digits ---

/** A store just big enough for the thunk: lists, identity, device. */
function storeHolding(listId: string) {
  let lists = listsReducer(listsReducer(undefined, { type: '@@INIT' }), {
    ...listCreated({ listId, name: 'Wocheneinkauf', ownerId: 'eiszebra' }),
  })
  const getState = () => ({
    lists,
    auth: { identity: { kind: 'guest', userId: 'me', name: 'Kicherzebra' } },
    app: { deviceId: 'd1' },
  })
  const dispatch = (action: unknown): unknown => {
    if (typeof action === 'function') {
      return (action as (d: unknown, g: unknown) => unknown)(dispatch, getState)
    }
    lists = listsReducer(lists, action as { type: string })
    return action
  }
  return {
    leave: (fetcher: Fetcher) =>
      dispatch(leaveList(listId, fetcher)) as Promise<void>,
    remaining: () => selectAllLists(getState()).map((list) => list.id),
  }
}

describe('leaving a list whose id holds the digits of a status', () => {
  // The removal really failed, so the membership stands and the list has to
  // come back. Read out of the message, the `403` in the id would have made
  // this look like a leave that had already happened.
  test('a real failure is still a failure', async () => {
    const store = storeHolding('a403bc')

    const failed = await store.leave(answering(500)).then(
      () => false,
      () => true,
    )

    expect(failed).toBe(true)
    expect(store.remaining()).toEqual(['a403bc'])
  })

  test('and a genuine 403 still means the list was never ours', async () => {
    const store = storeHolding('a403bc')

    await store.leave(answering(403))

    expect(store.remaining()).toEqual([])
  })
})
