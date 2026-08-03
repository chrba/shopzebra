import { describe, expect, test } from 'vitest'
import {
  listsReducer,
  listCreated,
  listMemberAdded,
  selectListById,
  selectListMembers,
} from '@/features/lists/domain/listsSlice'
import { identityAttached } from '@/features/auth/domain/authSlice'

const fold = (actions: readonly { type: string }[]) =>
  actions.reduce(
    (state, action) => listsReducer(state, action),
    listsReducer(undefined, { type: '@@INIT' }),
  )

describe('identityAttached', () => {
  // The guest's lists were authored under the sentinel; after docking they
  // belong to the real sub — otherwise isOwner and the member row lie.
  test('rewrites ownerId and memberIds of every list', () => {
    const lists = fold([
      listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'local-user' }),
      identityAttached({ previousUserId: 'local-user', userId: 'sub-123' }),
    ])

    expect(selectListById({ lists }, 'l1')?.ownerId).toBe('sub-123')
    expect(selectListMembers({ lists }, 'l1').map((member) => member.id)).toEqual(
      ['sub-123'],
    )
  })

  test('leaves foreign user ids alone', () => {
    const lists = fold([
      listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'other-sub' }),
      identityAttached({ previousUserId: 'local-user', userId: 'sub-123' }),
    ])

    expect(selectListById({ lists }, 'l1')?.ownerId).toBe('other-sub')
  })

  // The name a guest gave a member before docking still belongs to that
  // member afterwards — the key moves with the id.
  test('moves the display name onto the new id', () => {
    const withName = listsReducer(
      fold([listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'local-user' })]),
      listMemberAdded({ listId: 'l1', memberId: 'local-user', name: 'Chris' }),
    )
    const lists = listsReducer(
      withName,
      identityAttached({ previousUserId: 'local-user', userId: 'sub-123' }),
    )

    expect(selectListMembers({ lists }, 'l1')).toEqual([
      { id: 'sub-123', name: 'Chris', isOwner: true },
    ])
  })
})
