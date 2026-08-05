import { describe, expect, test } from 'vitest'
import {
  ZEBRA_NAMES,
  randomZebraName,
} from '@/features/auth/domain/zebraNames'

describe('the zebra names', () => {
  // The size is the whole collision argument: with six people on one list
  // (MAX_LIST_MEMBERS) a duplicate stays around five percent.
  test('there are 300 of them and none twice', () => {
    expect(ZEBRA_NAMES).toHaveLength(300)
    expect(new Set(ZEBRA_NAMES).size).toBe(300)
  })

  // "das Zebra" is neuter, which is what makes every one of these names
  // genderless — a name that breaks the pattern would break that too.
  test('every one of them is a zebra', () => {
    expect(ZEBRA_NAMES.filter((name) => !name.endsWith('zebra'))).toEqual([])
  })

  // They share a 150-pixel tile with an item count.
  test('none of them outgrows a tile', () => {
    expect(ZEBRA_NAMES.filter((name) => name.length > 17)).toEqual([])
  })

  test('drawing yields one of them', () => {
    for (let draw = 0; draw < 50; draw += 1) {
      expect(ZEBRA_NAMES).toContain(randomZebraName())
    }
  })
})
