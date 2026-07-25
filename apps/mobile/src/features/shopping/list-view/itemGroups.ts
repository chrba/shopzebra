import type { ListItem } from '../domain/shoppingDomain'
import {
  PRODUCT_CATEGORIES,
  findCatalogProduct,
} from '../domain/productCatalog'

/**
 * Tile view model: variants of a product collapse into one tile
 * ("2 Sorten · 4 St"), keyed by parentId ?? id.
 */
export type ItemGroup = {
  readonly key: string
  readonly name: string
  readonly emoji: string
  readonly categoryId: string
  readonly statusLine: string
  readonly hasNote: boolean
  readonly addedBy: string
  readonly items: readonly ListItem[]
}

const FALLBACK_EMOJI = '\u{1F6D2}'

function categoryOrder(categoryId: string): number {
  const position = PRODUCT_CATEGORIES.findIndex(
    (category) => category.id === categoryId,
  )
  return position < 0 ? PRODUCT_CATEGORIES.length : position
}

function statusLineFor(items: readonly ListItem[]): string {
  const variantCount = items.filter((item) => item.parentId).length
  if (variantCount > 0) {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
    return variantCount > 1
      ? `${variantCount} Sorten · ${totalQuantity} St`
      : `${items[0]?.name ?? ''} · ${totalQuantity} St`
  }
  const generic = items[0]
  if (!generic) return ''
  return `${generic.quantity} ${generic.unit}`
}

/**
 * Groups items by product (parentId ?? id), sorted in supermarket-aisle
 * order (the CATEGORIES order from the catalog).
 */
export function groupItemsByProduct(
  items: readonly ListItem[],
): readonly ItemGroup[] {
  const byProduct = new Map<string, ListItem[]>()
  for (const item of items) {
    const key = item.parentId ?? item.id
    const group = byProduct.get(key)
    if (group) {
      group.push(item)
    } else {
      byProduct.set(key, [item])
    }
  }

  const groups = [...byProduct.entries()].map(([key, groupItems]) => {
    const catalogProduct = findCatalogProduct(key)
    const firstItem = groupItems[0]
    return {
      key,
      name: catalogProduct?.name ?? firstItem?.name ?? key,
      emoji: catalogProduct?.emoji ?? FALLBACK_EMOJI,
      categoryId: firstItem?.category ?? '',
      statusLine: statusLineFor(groupItems),
      hasNote: groupItems.some((item) => (item.note ?? '') !== ''),
      addedBy: firstItem?.addedBy ?? '',
      items: groupItems,
    }
  })

  return groups.sort(
    (left, right) =>
      categoryOrder(left.categoryId) - categoryOrder(right.categoryId) ||
      left.name.localeCompare(right.name),
  )
}
