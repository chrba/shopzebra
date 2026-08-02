import { describe, expect, it } from 'vitest'
import { scaleIngredients } from '@/features/recipes/domain/recipesDomain'

const forFour = [
  { name: 'Spaghetti', quantity: '500', unit: 'g' },
  { name: 'Hackfleisch', quantity: '400', unit: 'g' },
]

describe('cooking a recipe for a different number of people', () => {
  it('a recipe for 4 shows doubled quantities at 8 portions', () => {
    expect(scaleIngredients(forFour, 4, 8)).toEqual([
      { name: 'Spaghetti', quantity: '1000', unit: 'g' },
      { name: 'Hackfleisch', quantity: '800', unit: 'g' },
    ])
  })

  it('halving works the same way', () => {
    expect(scaleIngredients(forFour, 4, 2)[0]?.quantity).toBe('250')
  })

  it('the same number of portions leaves everything untouched', () => {
    expect(scaleIngredients(forFour, 4, 4)).toEqual(forFour)
  })

  it('a quantity that is not a number stays as written', () => {
    const seasoned = [
      { name: 'Salz', quantity: 'etwas', unit: '' },
      { name: 'Pfeffer', quantity: '1 Prise', unit: '' },
      { name: 'Lorbeer', quantity: '', unit: 'Blatt' },
    ]

    expect(scaleIngredients(seasoned, 4, 8)).toEqual(seasoned)
  })

  it('a comma decimal scales like a dot decimal', () => {
    const cream = [{ name: 'Sahne', quantity: '0,5', unit: 'l' }]

    expect(scaleIngredients(cream, 2, 4)[0]?.quantity).toBe('1')
  })

  it('an awkward factor is rounded rather than shown to twelve decimals', () => {
    const dough = [{ name: 'Mehl', quantity: '100', unit: 'g' }]

    expect(scaleIngredients(dough, 3, 4)[0]?.quantity).toBe('133.33')
  })

  it('a nonsensical portion count changes nothing instead of dividing by zero', () => {
    expect(scaleIngredients(forFour, 0, 4)).toEqual(forFour)
    expect(scaleIngredients(forFour, 4, 0)).toEqual(forFour)
  })
})
