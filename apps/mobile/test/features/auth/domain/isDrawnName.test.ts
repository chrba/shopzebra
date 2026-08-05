import { describe, expect, test } from 'vitest'
import { isDrawnName, randomZebraName } from '@/features/auth/domain/zebraNames'

describe('isDrawnName', () => {
  // The profile marks a drawn name as such; getting this wrong would tell
  // people their own name was invented, or hide that a zebra is one.
  test('knows a name it drew itself', () => {
    expect(isDrawnName(randomZebraName())).toBe(true)
  })

  test('leaves a chosen name alone', () => {
    expect(isDrawnName('Christian')).toBe(false)
    expect(isDrawnName('')).toBe(false)
  })

  // Close is not enough — only the real ones count.
  test('is not fooled by something zebra-ish', () => {
    expect(isDrawnName('Zebra')).toBe(false)
    expect(isDrawnName('naschzebra')).toBe(false)
  })
})
