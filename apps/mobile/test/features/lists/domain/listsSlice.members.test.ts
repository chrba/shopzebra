import { describe, expect, it } from 'vitest'
import {
  listCreated,
  listMemberAdded,
  listMemberRemoved,
  listsReducer,
  ownerNamesLoaded,
  selectListMembers,
} from '@/features/lists/domain/listsSlice'

// Behavior-level, like the sibling slice tests: actions go in through the
// public action creators, results come out through the public selectors.
// Payloads follow the wire format in services/events.md.

type ListsRootState = Parameters<typeof selectListMembers>[0]

const initialization = { type: '@@INIT' }

function rootStateAfter(
  ...actions: readonly { readonly type: string }[]
): ListsRootState {
  const lists = actions.reduce(
    listsReducer,
    listsReducer(undefined, initialization),
  )
  return { lists }
}

const createdByMama = listCreated({
  listId: 'l1',
  name: 'Einkauf',
  ownerId: 'mama',
})

describe('listMemberAdded', () => {
  it('adds the member with their display name', () => {
    const state = rootStateAfter(
      createdByMama,
      listMemberAdded({ listId: 'l1', memberId: 'tom', name: 'Tom' }),
    )

    expect(selectListMembers(state, 'l1')).toEqual([
      { id: 'mama', name: null, isOwner: true },
      { id: 'tom', name: 'Tom', isOwner: false },
    ])
  })

  it('folds the same member twice without duplicating', () => {
    const added = listMemberAdded({
      listId: 'l1',
      memberId: 'tom',
      name: 'Tom',
    })
    const state = rootStateAfter(createdByMama, added, added)

    expect(selectListMembers(state, 'l1')).toHaveLength(2)
  })

  it('ignores an event for an unknown list', () => {
    const state = rootStateAfter(
      createdByMama,
      listMemberAdded({ listId: 'ghost', memberId: 'tom', name: 'Tom' }),
    )

    expect(selectListMembers(state, 'ghost')).toEqual([])
    expect(selectListMembers(state, 'l1')).toHaveLength(1)
  })
})

describe('listMemberRemoved', () => {
  it('drops the member and their name', () => {
    const state = rootStateAfter(
      createdByMama,
      listMemberAdded({ listId: 'l1', memberId: 'tom', name: 'Tom' }),
      listMemberRemoved({ listId: 'l1', memberId: 'tom' }),
    )

    expect(selectListMembers(state, 'l1')).toEqual([
      { id: 'mama', name: null, isOwner: true },
    ])
  })

  it('ignores the removal of somebody who is not a member', () => {
    const state = rootStateAfter(
      createdByMama,
      listMemberRemoved({ listId: 'l1', memberId: 'ghost' }),
    )

    expect(selectListMembers(state, 'l1')).toHaveLength(1)
  })

  it('ignores an event for an unknown list', () => {
    const state = rootStateAfter(
      createdByMama,
      listMemberRemoved({ listId: 'ghost', memberId: 'mama' }),
    )

    expect(selectListMembers(state, 'l1')).toHaveLength(1)
  })
})

describe('the owner name from the list projection', () => {
  it('shows up on the owner entry', () => {
    const state = rootStateAfter(
      createdByMama,
      ownerNamesLoaded({ ownerNames: { l1: 'Sarah' } }),
    )

    expect(selectListMembers(state, 'l1')).toEqual([
      { id: 'mama', name: 'Sarah', isOwner: true },
    ])
  })

  it('never overrides a name that arrived through an event', () => {
    const state = rootStateAfter(
      createdByMama,
      listMemberAdded({ listId: 'l1', memberId: 'tom', name: 'Tom' }),
      ownerNamesLoaded({ ownerNames: { l1: 'Sarah' } }),
    )

    expect(selectListMembers(state, 'l1')).toEqual([
      { id: 'mama', name: 'Sarah', isOwner: true },
      { id: 'tom', name: 'Tom', isOwner: false },
    ])
  })
})
