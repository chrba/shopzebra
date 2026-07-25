import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectListById } from '../../lists/domain/listsSlice'
import { selectAuthUser } from '../../auth/domain/authSlice'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  PRODUCT_CATALOG,
  PRODUCT_CATEGORIES,
  type CatalogProduct,
} from '../domain/productCatalog'
import {
  itemAdded,
  itemChecked,
  itemRemoved,
  itemUnchecked,
  selectListItems,
} from '../domain/shoppingSlice'
import { ItemDetailSheet } from '../ItemDetailSheet'
import { groupItemsByProduct } from './itemGroups'
import { ItemTile } from './ItemTile'

const SEARCH_RESULT_LIMIT = 12

/** Left arrow used in the nav header to go back to lists. */
function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  )
}

/** Chevron for the category navigation rows. */
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="fill-muted-foreground size-4">
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
    </svg>
  )
}

/** Big checkmark of the celebration state. */
function CelebrationIcon() {
  return (
    <svg viewBox="0 0 24 24" className="fill-teal size-10">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  )
}

type ShoppingListPageProps = {
  readonly listId: string
}

/**
 * Main shopping screen: active items as tiles (tap = check off, hold =
 * details), collapsible done section, catalog search and the category
 * navigation into the catalog pages. Layout follows design/pure/list.html.
 */
export function ShoppingListPage({ listId }: ShoppingListPageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const items = useAppSelector((state) => selectListItems(state, listId))
  const user = useAppSelector(selectAuthUser)

  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [sheetProductId, setSheetProductId] = useState<string | null>(null)

  if (!list) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-muted-foreground">Liste nicht gefunden</p>
      </div>
    )
  }

  const openGroups = groupItemsByProduct(items.filter((item) => !item.checked))
  const doneGroups = groupItemsByProduct(items.filter((item) => item.checked))
  const total = items.length
  const done = items.filter((item) => item.checked).length
  const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0
  const allDone = total > 0 && done === total
  const currentUserId = user?.userId ?? 'unknown'

  const searchTerm = searchInput.trim().toLowerCase()
  const searchResults =
    searchTerm === ''
      ? []
      : PRODUCT_CATALOG.filter((product) =>
          product.name.toLowerCase().includes(searchTerm),
        ).slice(0, SEARCH_RESULT_LIMIT)

  const openItemCountFor = (categoryId: string) =>
    items.filter((item) => !item.checked && item.category === categoryId).length

  const addProduct = (product: CatalogProduct) => {
    if (product.variants) {
      setSheetProductId(product.id)
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
    setSearchInput('')
  }

  const checkOffGroup = (groupItemIds: readonly string[]) => {
    for (const itemId of groupItemIds) {
      dispatch(itemChecked({ listId, itemId, checkedBy: currentUserId }))
    }
  }

  const restoreGroup = (groupItemIds: readonly string[]) => {
    for (const itemId of groupItemIds) {
      dispatch(itemUnchecked({ listId, itemId }))
    }
  }

  const startNewShopping = () => {
    for (const item of items) {
      dispatch(itemRemoved({ listId, itemId: item.id }))
    }
    setCompletedExpanded(false)
  }

  return (
    <div className="min-h-screen pb-[100px]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => navigate({ to: '/lists' })}
          aria-label="Zurück zu Listen"
        >
          <BackIcon />
        </Button>
        <h1 className="font-display flex-1 text-center text-[17px] font-bold">
          {list.name}
        </h1>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() =>
            navigate({ to: '/lists/$listId/edit', params: { listId } })
          }
          aria-label="Liste bearbeiten"
        >
          ✏️
        </Button>
      </header>

      {/* Cart section */}
      <section className="px-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[15px] font-bold">Einkaufswagen</h2>
          <span className="text-muted-foreground text-xs font-medium">
            {total} Artikel
          </span>
        </div>

        {total > 0 && (
          <div className="mt-2">
            <div className="text-muted-foreground flex justify-between text-[11px] font-medium">
              <span>
                {done} von {total} erledigt
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="bg-secondary mt-1 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-teal h-full rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {allDone ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="bg-teal/15 flex size-16 items-center justify-center rounded-full">
              <CelebrationIcon />
            </div>
            <p className="font-display text-lg font-bold">Alles eingekauft!</p>
            <p className="text-muted-foreground text-xs">
              {total} Artikel erledigt
            </p>
            <Button
              onClick={startNewShopping}
              className="bg-teal mt-2 rounded-xl px-6 font-bold text-white"
            >
              Neuer Einkauf
            </Button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {openGroups.map((group) => (
              <ItemTile
                key={group.key}
                group={group}
                checked={false}
                foreignInitial={
                  group.addedBy !== currentUserId
                    ? group.addedBy.charAt(0).toUpperCase() || null
                    : null
                }
                onTap={() => checkOffGroup(group.items.map((item) => item.id))}
                onLongPress={() => setSheetProductId(group.key)}
              />
            ))}
          </div>
        )}

        {total === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Noch nichts im Wagen — unten Produkte auswählen
          </p>
        )}

        {/* Completed section */}
        {doneGroups.length > 0 && !allDone && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setCompletedExpanded(!completedExpanded)}
              className="text-muted-foreground flex w-full items-center gap-2 text-xs font-semibold tracking-wider uppercase"
            >
              <span
                className={cn(
                  'transition-transform',
                  completedExpanded && 'rotate-90',
                )}
              >
                <ChevronIcon />
              </span>
              Erledigt
              <span className="bg-secondary rounded-full px-2 py-0.5 text-[10px]">
                {done}
              </span>
            </button>
            {completedExpanded && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {doneGroups.map((group) => (
                  <ItemTile
                    key={group.key}
                    group={group}
                    checked
                    foreignInitial={null}
                    onTap={() =>
                      restoreGroup(group.items.map((item) => item.id))
                    }
                    onLongPress={() => setSheetProductId(group.key)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Catalog search */}
      <section className="mt-5 px-5">
        <Input
          type="text"
          placeholder="Produkt suchen..."
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="h-auto rounded-2xl px-4 py-3 text-sm"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {searchResults.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addProduct(product)}
                className="bg-card border-border flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-2xl border p-2 transition-all active:scale-95"
              >
                <span className="text-2xl leading-none">{product.emoji}</span>
                <span className="text-[11px] leading-tight font-semibold">
                  {product.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Category navigation */}
      <section className="mt-5 px-5">
        <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
          Kategorien
        </h2>
        <div className="flex flex-col gap-1.5">
          {PRODUCT_CATEGORIES.map((category) => {
            const badgeCount = openItemCountFor(category.id)
            return (
              <button
                key={category.id}
                type="button"
                onClick={() =>
                  navigate({
                    to: '/lists/$listId/category/$categoryId',
                    params: { listId, categoryId: category.id },
                  })
                }
                className="bg-card border-border flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all active:scale-[0.98]"
              >
                <span className="text-2xl leading-none">{category.emoji}</span>
                <span className="flex-1 text-left text-sm font-semibold">
                  {category.name}
                </span>
                {badgeCount > 0 && (
                  <span className="bg-teal/15 text-teal rounded-full px-2 py-0.5 text-[11px] font-bold">
                    {badgeCount}
                  </span>
                )}
                <ChevronIcon />
              </button>
            )
          })}
        </div>
      </section>

      {sheetProductId !== null && (
        <ItemDetailSheet
          listId={listId}
          productId={sheetProductId}
          context="list"
          onClose={() => setSheetProductId(null)}
        />
      )}
    </div>
  )
}
