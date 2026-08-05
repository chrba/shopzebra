import { describe, expect, test } from 'vitest'
import { listsFromStorage } from '@/features/lists/domain/listsFromStorage'

describe('listsFromStorage', () => {
  // The bug this exists for: the boot code rebuilt every list from four
  // named fields and dropped memberNames, so every name written to the
  // device was thrown away on the way back in. Shared lists then showed
  // "Mitglied" until the network answered.
  test('keeps the names of everyone on the list', () => {
    const restored = listsFromStorage([
      {
        id: 'l1',
        name: 'Wocheneinkauf',
        ownerId: 'sarah',
        memberIds: ['sarah', 'me'],
        memberNames: { sarah: 'Eiszebra', me: 'Kicherzebra' },
      },
    ])

    expect(restored[0]?.memberNames).toEqual({
      sarah: 'Eiszebra',
      me: 'Kicherzebra',
    })
  })

  // Lists written before the owner model have no ownerId.
  test('falls back to the first member when the owner is missing', () => {
    const restored = listsFromStorage([
      { id: 'l1', name: 'Alt', memberIds: ['sarah'] },
    ])

    expect(restored[0]?.ownerId).toBe('sarah')
  })

  test('drops entries without an id or a name', () => {
    const restored = listsFromStorage([
      { id: 'l1', name: 'Gut', memberIds: [] },
      { id: 'l2', memberIds: [] },
      { name: 'Namenlos', memberIds: [] },
    ])

    expect(restored.map((list) => list.id)).toEqual(['l1'])
  })

  test('treats anything that is not an array as nothing stored', () => {
    expect(listsFromStorage(null)).toEqual([])
    expect(listsFromStorage({ lists: [] })).toEqual([])
  })
})
