import { describe, expect, test } from 'vitest'
import type { Fetcher } from '@/app/authFetch'
import { leaveList } from '@/features/lists/domain/leaveList'
import {
  listsReducer,
  listCreated,
  selectAllLists,
} from '@/features/lists/domain/listsSlice'

const listOfSarah = listCreated({
  listId: 'l1',
  name: 'Wocheneinkauf',
  ownerId: 'sarah',
})

/** A store just big enough for the thunk: lists, identity, device. */
function storeOf() {
  // The reducer only initialises on an unknown action — folding the
  // fixture straight onto `undefined` would silently yield no list.
  let lists = listsReducer(
    listsReducer(undefined, { type: '@@INIT' }),
    listOfSarah,
  )
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
      dispatch(leaveList('l1', fetcher)) as Promise<void>,
    remaining: () => selectAllLists(getState()).map((list) => list.id),
  }
}

const answering =
  (status: number): Fetcher =>
  () =>
    Promise.resolve(new Response(null, { status }))

describe('leaving a list', () => {
  // The point of the whole exercise: the tile goes away on the tap, not one
  // round trip later. Local-first means the network never gates the screen.
  test('drops the list before the server has answered', async () => {
    let answer = () => {}
    const waiting: Fetcher = () =>
      new Promise((resolve) => {
        answer = () => resolve(new Response(null, { status: 204 }))
      })
    const store = storeOf()

    const leaving = store.leave(waiting)
    await Promise.resolve()

    expect(store.remaining()).toEqual([])

    answer()
    await leaving
    expect(store.remaining()).toEqual([])
  })

  // Optimism needs a way back: the membership still exists on the server,
  // so the list must not stay gone.
  test('puts the list back when the server refuses', async () => {
    const store = storeOf()

    const failed = await store.leave(answering(500)).then(
      () => false,
      () => true,
    )

    expect(failed).toBe(true)
    expect(store.remaining()).toEqual(['l1'])
  })

  // A 403 means the membership is already gone — leaving had happened
  // before, so the list stays away rather than coming back.
  test('keeps the list gone when the server says it was never ours', async () => {
    const store = storeOf()

    await store.leave(answering(403))

    expect(store.remaining()).toEqual([])
  })
})
