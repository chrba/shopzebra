import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectAuthUser } from '../../auth/domain/authSlice'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  PRODUCT_CATALOG,
  PRODUCT_CATEGORIES,
  type CatalogProduct,
} from '../domain/productCatalog'
import {
  itemAdded,
  itemRemoved,
  selectListItems,
} from '../domain/shoppingSlice'
import type { ListItem } from '../domain/shoppingDomain'
import { ItemDetailSheet } from '../ItemDetailSheet'
import { useLongPress } from '../useLongPress'

/** Left arrow used in the nav header to go back to the list. */
function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  )
}

function statusLineFor(
  product: CatalogProduct,
  productItems: readonly ListItem[],
): string {
  if (productItems.length === 0) return product.unit
  const variantCount = productItems.filter((item) => item.parentId).length
  const totalQuantity = productItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  )
  if (variantCount > 1) return `${variantCount} Sorten · ${totalQuantity} St`
  if (variantCount === 1)
    return `${productItems[0]?.name} · ${totalQuantity} St`
  return `${totalQuantity} ${product.unit}`
}

type ProductTileProps = {
  readonly product: CatalogProduct
  readonly selected: boolean
  readonly statusLine: string
  readonly onTap: () => void
  readonly onLongPress: () => void
}

/** One catalog product tile — tap toggles, holding opens details. */
function ProductTile({
  product,
  selected,
  statusLine,
  onTap,
  onLongPress,
}: ProductTileProps) {
  const pressHandlers = useLongPress(onLongPress, onTap)

  return (
    <button
      type="button"
      {...pressHandlers}
      className={cn(
        'bg-card flex min-h-[100px] flex-col items-center justify-center gap-1 rounded-2xl border p-2 transition-all select-none active:scale-95',
        selected ? 'border-teal bg-teal/10' : 'border-border',
      )}
    >
      <span className="text-3xl leading-none">{product.emoji}</span>
      <span className="text-[12px] leading-tight font-semibold">
        {product.name}
      </span>
      <span
        className={cn(
          'text-[10px] font-medium',
          selected ? 'text-teal' : 'text-muted-foreground',
        )}
      >
        {statusLine}
      </span>
    </button>
  )
}

type CategoryPageProps = {
  readonly listId: string
  readonly categoryId: string
}

/**
 * Catalog page of one category: 3-column product grid, tap adds/removes
 * the product, holding opens the variant sheet. Layout follows
 * design/pure/category.html.
 */
export function CategoryPage({ listId, categoryId }: CategoryPageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const items = useAppSelector((state) => selectListItems(state, listId))
  const user = useAppSelector(selectAuthUser)

  const [sheetProductId, setSheetProductId] = useState<string | null>(null)

  const category = PRODUCT_CATEGORIES.find((entry) => entry.id === categoryId)
  const products = PRODUCT_CATALOG.filter(
    (product) => product.categoryId === categoryId,
  )
  const currentUserId = user?.userId ?? 'unknown'
  const listItemCount = items.filter((item) => !item.checked).length

  const itemsOf = (productId: string) =>
    items.filter((item) => (item.parentId ?? item.id) === productId)

  const toggleProduct = (product: CatalogProduct) => {
    const productItems = itemsOf(product.id)
    if (productItems.length > 0) {
      for (const item of productItems) {
        dispatch(itemRemoved({ listId, itemId: item.id }))
      }
      return
    }
    dispatch(
      itemAdded({
        listId,
        itemId: product.id,
        name: product.name,
        quantity: 1,
        unit: product.unit,
        category: product.categoryId,
        addedBy: currentUserId,
      }),
    )
  }

  const goBackToList = () =>
    navigate({ to: '/lists/$listId', params: { listId } })

  if (!category) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-muted-foreground">Kategorie nicht gefunden</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-[110px]">
      {/* Header */}
      <header className="px-5 pt-4 pb-2">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={goBackToList}
            aria-label="Zurück zur Liste"
          >
            <BackIcon />
          </Button>
          <h1 className="font-display flex-1 text-center text-[17px] font-bold">
            {category.emoji} {category.name}
          </h1>
          <div className="w-8" />
        </div>
        <p className="text-muted-foreground text-center text-xs font-medium">
          {products.length} Produkte
        </p>
      </header>

      {/* Product grid */}
      <div className="grid grid-cols-3 gap-2 px-5 pt-2">
        {products.map((product) => {
          const productItems = itemsOf(product.id)
          return (
            <ProductTile
              key={product.id}
              product={product}
              selected={productItems.length > 0}
              statusLine={statusLineFor(product, productItems)}
              onTap={() => toggleProduct(product)}
              onLongPress={() => setSheetProductId(product.id)}
            />
          )
        })}
      </div>

      {/* Bottom bar */}
      <div className="border-border bg-background fixed inset-x-0 bottom-0 flex items-center justify-between border-t px-5 py-4">
        <span className="text-muted-foreground text-sm font-medium">
          {listItemCount} Artikel auf der Liste
        </span>
        <Button
          onClick={goBackToList}
          className="bg-teal rounded-xl px-6 font-bold text-white"
        >
          Fertig
        </Button>
      </div>

      {sheetProductId !== null && (
        <ItemDetailSheet
          listId={listId}
          productId={sheetProductId}
          context="catalog"
          onClose={() => setSheetProductId(null)}
        />
      )}
    </div>
  )
}
