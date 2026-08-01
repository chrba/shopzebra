import { describe, expect, it } from 'vitest'
import {
  friendRemoved,
  friendsLoaded,
  friendsReducer,
  friendsRestored,
  selectFriendCount,
  selectFriends,
} from '@/features/friends/domain/friendsSlice'

type FriendsRootState = Parameters<typeof selectFriends>[0]

function rootStateAfter(
  ...actions: readonly { readonly type: string }[]
): FriendsRootState {
  const friends = actions.reduce(
    friendsReducer,
    friendsReducer(undefined, { type: '@@INIT' }),
  )
  return { friends }
}

const sarahAndTom = [
  { id: 'sarah', name: 'Sarah' },
  { id: 'tom', name: null },
] as const

describe('the address book', () => {
  it('starts empty', () => {
    expect(selectFriends(rootStateAfter())).toEqual([])
    expect(selectFriendCount(rootStateAfter())).toBe(0)
  })

  it('holds what the server answered', () => {
    const state = rootStateAfter(friendsLoaded({ friends: sarahAndTom }))

    expect(selectFriends(state)).toEqual(sarahAndTom)
  })

  it('comes back from the cache on a cold start', () => {
    const state = rootStateAfter(friendsRestored({ friends: sarahAndTom }))

    expect(selectFriends(state)).toEqual(sarahAndTom)
  })

  it('drops a removed friend immediately', () => {
    const state = rootStateAfter(
      friendsLoaded({ friends: sarahAndTom }),
      friendRemoved({ friendId: 'tom' }),
    )

    expect(selectFriends(state)).toEqual([{ id: 'sarah', name: 'Sarah' }])
  })

  it('replaces the cached state once the server answers', () => {
    const state = rootStateAfter(
      friendsRestored({ friends: sarahAndTom }),
      friendsLoaded({ friends: [{ id: 'lena', name: 'Lena' }] }),
    )

    expect(selectFriends(state)).toEqual([{ id: 'lena', name: 'Lena' }])
  })
})
