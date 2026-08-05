import { describe, expect, test } from 'vitest'
import { memberAddedLocally } from '@/features/sharing/memberCommands'
import {
  listsReducer,
  listCreated,
  selectListMembers,
} from '@/features/lists/domain/listsSlice'
import { needsSync } from '@/app/sync/needsSync'

const fold = (actions: readonly { type: string }[]) =>
  actions.reduce(
    (state, action) => listsReducer(state, action),
    listsReducer(undefined, { type: '@@INIT' }),
  )

describe('memberAddedLocally', () => {
  // Adding a friend must show up on the tap, not after the command has
  // travelled and a whole sync cycle has run.
  test('puts the member on the list at once', () => {
    const lists = fold([
      listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'adnan' }),
      memberAddedLocally({ kind: 'list', id: 'l1' }, 'sarah', 'Eiszebra'),
    ])

    expect(
      selectListMembers({ lists }, 'l1').map((member) => [
        member.id,
        member.name,
      ]),
    ).toEqual([
      ['adnan', null],
      ['sarah', 'Eiszebra'],
    ])
  })

  // The server writes the real event; this is only the local echo. Sent
  // back it would be a member-added event the client may not write.
  test('is never sent to the server', () => {
    expect(
      needsSync({
        ...memberAddedLocally({ kind: 'list', id: 'l1' }, 'sarah', 'Eiszebra'),
        meta: { eventId: 'e1', deviceId: 'd1', remote: true },
      }),
    ).toBe(false)
  })

  test('speaks the recipe event for a recipe', () => {
    expect(
      memberAddedLocally({ kind: 'recipe', id: 'r1' }, 'sarah', 'Eiszebra')
        .type,
    ).toBe('recipes/recipeMemberAdded')
  })
})
