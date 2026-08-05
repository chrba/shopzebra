import { describe, expect, test } from 'vitest'
import { memberCountLabel } from '@/features/sharing/MembersPage'

describe('memberCountLabel', () => {
  // A list you have not shared yet says "1 Mitglied", not "1 Mitglieder".
  test('stays singular for one', () => {
    expect(memberCountLabel(1)).toBe('1 Mitglied')
  })

  test('is plural for everything else', () => {
    expect(memberCountLabel(2)).toBe('2 Mitglieder')
    expect(memberCountLabel(0)).toBe('0 Mitglieder')
  })
})
