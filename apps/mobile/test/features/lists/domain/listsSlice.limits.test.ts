import { describe, expect, it } from 'vitest'
import {
  listCreated,
  listMemberAdded,
  listsLoaded,
  listsReducer,
  memberLimitLoaded,
  selectListIsFull,
  selectMaxMembers,
} from '@/features/lists/domain/listsSlice'

type ListsRootState = Parameters<typeof selectMaxMembers>[0]

function rootStateAfter(
  ...actions: readonly { readonly type: string }[]
): ListsRootState {
  const lists = actions.reduce(
    listsReducer,
    listsReducer(undefined, { type: '@@INIT' }),
  )
  return { lists }
}

const createdList = listCreated({
  listId: 'l1',
  name: 'Einkauf',
  ownerId: 'mama',
})

function withMembers(count: number) {
  const joins = Array.from({ length: count }, (_, index) =>
    listMemberAdded({
      listId: 'l1',
      memberId: `member-${index}`,
      name: `M${index}`,
    }),
  )
  return [createdList, ...joins]
}

describe('the member cap from the server', () => {
  it('is unknown until the projection arrives', () => {
    expect(selectMaxMembers(rootStateAfter(createdList))).toBeNull()
  })

  it('an unknown cap never reports a list as full', () => {
    const state = rootStateAfter(...withMembers(9))

    expect(selectListIsFull(state, 'l1')).toBe(false)
  })

  it('reports full exactly at the cap', () => {
    const belowCap = rootStateAfter(
      ...withMembers(4),
      memberLimitLoaded({ maxMembers: 6 }),
    )
    const atCap = rootStateAfter(
      ...withMembers(5),
      memberLimitLoaded({ maxMembers: 6 }),
    )

    // owner + 5 joined = 6 members
    expect(selectListIsFull(belowCap, 'l1')).toBe(false)
    expect(selectListIsFull(atCap, 'l1')).toBe(true)
  })

  it('survives a hydration from clientStorage', () => {
    const state = rootStateAfter(
      memberLimitLoaded({ maxMembers: 6 }),
      listsLoaded({ lists: [] }),
    )

    expect(selectMaxMembers(state)).toBe(6)
  })
})
