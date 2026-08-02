// The editor lets people type an ingredient the way they would write it on
// a note — "500g Spaghetti". These two functions are the seam between that
// one line and the structured ingredient the recipe stores.

import type { Ingredient } from '../domain/recipesDomain'

/** Units we recognise at the start of a line, longest first so "kg" wins over "g". */
const UNITS = [
  'kg',
  'ml',
  'el',
  'tl',
  'st',
  'stück',
  'dose',
  'dosen',
  'bund',
  'prise',
  'g',
  'l',
] as const

const LEADING_AMOUNT = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*(${UNITS.join('|')})?\\.?\\s*`,
  'i',
)

/**
 * Reads one typed line into an ingredient. A line without a leading number
 * ("Salz nach Geschmack") keeps its whole text as the name and no quantity —
 * scaling then leaves it alone, which is what a cook expects.
 * Returns null for a blank line, so empty rows simply drop out.
 */
export function parseIngredientLine(line: string): Ingredient | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const match = LEADING_AMOUNT.exec(trimmed)
  const name = match ? trimmed.slice(match[0].length).trim() : trimmed
  if (!match || !name) {
    return { name: trimmed, quantity: '', unit: '' }
  }

  return {
    name,
    quantity: (match[1] ?? '').replace(',', '.'),
    unit: (match[2] ?? '').toLowerCase(),
  }
}

/** The line the editor shows for a stored ingredient — inverse of the parse. */
export function toIngredientLine(ingredient: Ingredient): string {
  return [`${ingredient.quantity}${ingredient.unit}`.trim(), ingredient.name]
    .filter((part) => part !== '')
    .join(' ')
}

/** How an ingredient reads on the detail page: "500 g" next to "Spaghetti". */
export function ingredientAmountOf(ingredient: Ingredient): string {
  return [ingredient.quantity, ingredient.unit]
    .filter((part) => part !== '')
    .join(' ')
}
