/**
 * An item on a shopping list. Items belong to exactly one list —
 * they are part of the ShoppingList aggregate (domain-model.md §2).
 *
 * ID convention (variant model):
 *   generic product:  id = productId              (e.g. "apples")
 *   variant:          id = productId--variantName (e.g. "apples--Elstar")
 *   parentId present → item is a variant, parentId = productId
 */
export type ListItem = {
  readonly id: string
  readonly name: string
  readonly quantity: number
  readonly unit: string
  readonly category: string
  readonly checked: boolean
  readonly addedBy: string
  readonly parentId?: string
  readonly note?: string
}

export function variantItemId(productId: string, variantName: string): string {
  return `${productId}--${variantName}`
}
