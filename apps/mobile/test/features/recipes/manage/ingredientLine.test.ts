import { describe, expect, it } from 'vitest'
import {
  ingredientAmountOf,
  parseIngredientLine,
  toIngredientLine,
} from '@/features/recipes/manage/ingredientLine'

describe('writing an ingredient the way a cook would', () => {
  it('reads amount, unit and name out of one line', () => {
    expect(parseIngredientLine('500g Spaghetti')).toEqual({
      quantity: '500',
      unit: 'g',
      name: 'Spaghetti',
    })
    expect(parseIngredientLine('2 EL Olivenöl')).toEqual({
      quantity: '2',
      unit: 'el',
      name: 'Olivenöl',
    })
  })

  it('a bare number without a unit still counts as an amount', () => {
    expect(parseIngredientLine('2 Zwiebeln')).toEqual({
      quantity: '2',
      unit: '',
      name: 'Zwiebeln',
    })
  })

  it('a decimal amount survives, comma or dot', () => {
    expect(parseIngredientLine('1,5 kg Kartoffeln')?.quantity).toBe('1.5')
  })

  it('a line without an amount keeps its whole text as the name', () => {
    expect(parseIngredientLine('Salz nach Geschmack')).toEqual({
      quantity: '',
      unit: '',
      name: 'Salz nach Geschmack',
    })
  })

  it('a blank line is no ingredient at all', () => {
    expect(parseIngredientLine('   ')).toBeNull()
    expect(parseIngredientLine('')).toBeNull()
  })

  it('what was typed comes back when the recipe is edited again', () => {
    for (const line of [
      '500g Spaghetti',
      '2 Zwiebeln',
      'Salz nach Geschmack',
    ]) {
      const parsed = parseIngredientLine(line)
      expect(parsed).not.toBeNull()
      expect(toIngredientLine(parsed!).toLowerCase()).toBe(line.toLowerCase())
    }
  })

  it('the detail page shows amount and unit spaced apart', () => {
    expect(
      ingredientAmountOf({ name: 'Spaghetti', quantity: '500', unit: 'g' }),
    ).toBe('500 g')
    expect(
      ingredientAmountOf({ name: 'Zwiebeln', quantity: '2', unit: '' }),
    ).toBe('2')
    expect(ingredientAmountOf({ name: 'Salz', quantity: '', unit: '' })).toBe(
      '',
    )
  })
})
