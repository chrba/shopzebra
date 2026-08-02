/**
 * One ingredient line of a recipe. `quantity` is a string, not a number:
 * real recipes say "etwas" or "1 Prise" as readily as "500", and forcing a
 * number here would either lose those or invent a second field for them.
 */
export type Ingredient = {
  readonly name: string
  readonly quantity: string
  readonly unit: string
}

/**
 * A recipe, owned by its creator and shared exactly like a shopping list
 * (architecture/sharing-model.md). Synced to the backend — contains only
 * domain data; emoji and colour are local preferences and live in the
 * preferences slice.
 *
 * ownerId: the creator. Only the owner invites or removes members.
 */
export type Recipe = {
  readonly id: string
  readonly name: string
  readonly ownerId: string
  readonly memberIds: readonly string[]
  /** Display names keyed by memberId — same two sources as a list's. */
  readonly memberNames?: Readonly<Record<string, string>>
  /** How many people the stored quantities are meant for. */
  readonly portions: number
  /** Preparation time in minutes; absent when nobody supplied one. */
  readonly durationMinutes?: number
  readonly ingredients: readonly Ingredient[]
  readonly steps: readonly string[]
}

/**
 * The same ingredients written for a different number of portions. Purely
 * a display concern — the recipe keeps its stored portions, so scaling on
 * one device never changes what anybody else sees.
 *
 * Quantities that are not a plain number ("etwas", "1 Prise") pass through
 * untouched: there is nothing sensible to multiply, and dropping them would
 * lose an ingredient.
 */
export function scaleIngredients(
  ingredients: readonly Ingredient[],
  fromPortions: number,
  toPortions: number,
): readonly Ingredient[] {
  if (fromPortions <= 0 || toPortions <= 0 || fromPortions === toPortions) {
    return ingredients
  }
  const factor = toPortions / fromPortions
  return ingredients.map((ingredient) => {
    const amount = Number(ingredient.quantity.replace(',', '.'))
    if (ingredient.quantity.trim() === '' || Number.isNaN(amount)) {
      return ingredient
    }
    return { ...ingredient, quantity: formatAmount(amount * factor) }
  })
}

/** At most two decimals, and no trailing zeros — "250", not "250.00". */
function formatAmount(amount: number): string {
  return String(Math.round(amount * 100) / 100)
}
