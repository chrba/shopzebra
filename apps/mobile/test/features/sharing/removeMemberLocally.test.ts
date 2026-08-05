import { describe, expect, test } from 'vitest'
import { memberRemovedLocally } from '@/features/sharing/memberCommands'
import {
  listsReducer,
  listCreated,
  listMemberAdded,
  selectListMembers,
} from '@/features/lists/domain/listsSlice'
import { needsSync } from '@/app/sync/needsSync'

describe('memberRemovedLocally', () => {
  // The server wrote the event; folding it here is what makes the row go
  // away now instead of one round trip later.
  test('takes the member out of the list', () => {
    const withMember = [
      listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'adnan' }),
      listMemberAdded({ listId: 'l1', memberId: 'sarah', name: 'Sarah' }),
      memberRemovedLocally({ kind: 'list', id: 'l1' }, 'sarah'),
    ].reduce(
      (state, action) => listsReducer(state, action),
      listsReducer(undefined, { type: '@@INIT' }),
    )

    expect(
      selectListMembers({ lists: withMember }, 'l1').map((member) => member.id),
    ).toEqual(['adnan'])
  })

  // It is an echo of what the server already did — sending it back would
  // post a member-removed event the client is not allowed to write.
  test('is never sent to the server', () => {
    expect(
      needsSync({
        ...memberRemovedLocally({ kind: 'list', id: 'l1' }, 'sarah'),
        meta: { eventId: 'e1', deviceId: 'd1', remote: true },
      }),
    ).toBe(false)
  })

  test('speaks the recipe event for a recipe', () => {
    expect(
      memberRemovedLocally({ kind: 'recipe', id: 'r1' }, 'sarah').type,
    ).toBe('recipes/recipeMemberRemoved')
  })
})
