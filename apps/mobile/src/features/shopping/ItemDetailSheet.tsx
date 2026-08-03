import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { selectCurrentUserId } from '../auth/domain/authSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { findCatalogProduct } from './domain/productCatalog'
import { variantItemId } from './domain/shoppingDomain'
import {
  customVariantAdded,
  itemAdded,
  itemNoteUpdated,
  itemRemoved,
  itemUpdated,
  selectCustomVariants,
  selectListItems,
} from './domain/shoppingSlice'

const QUANTITY_CHIPS = [1, 2, 3, 4, 5] as const
const NOTE_MAX_LENGTH = 100

type ItemDetailSheetProps = {
  readonly listId: string
  readonly productId: string
  /** 'list' shows the remove button and the addedBy hint (design/pure rules). */
  readonly context: 'list' | 'catalog'
  readonly onClose: () => void
}

/**
 * Bottom sheet with product details — functionally identical on the list
 * page and the category page (design/pure/CLAUDE.md: Overlay-Konsistenz).
 * Variants toggle as independent items, quantity chips control the generic
 * item, the note commits on blur.
 */
export function ItemDetailSheet({
  listId,
  productId,
  context,
  onClose,
}: ItemDetailSheetProps) {
  const dispatch = useAppDispatch()
  const addedBy = useAppSelector(selectCurrentUserId)
  const allItems = useAppSelector((state) => selectListItems(state, listId))
  const customVariants = useAppSelector((state) =>
    selectCustomVariants(state, listId, productId),
  )

  const product = findCatalogProduct(productId)
  const groupItems = allItems.filter(
    (item) => (item.parentId ?? item.id) === productId,
  )
  const genericItem = groupItems.find((item) => item.id === productId) ?? null
  const noteItem = genericItem ?? groupItems[0] ?? null

  const [customVariantName, setCustomVariantName] = useState('')
  const [noteDraft, setNoteDraft] = useState(noteItem?.note ?? '')

  if (!product && groupItems.length === 0) return null

  const name = product?.name ?? noteItem?.name ?? productId
  const emoji = product?.emoji ?? '\u{1F6D2}'
  const unit = product?.unit ?? noteItem?.unit ?? 'St'
  const categoryId = product?.categoryId ?? noteItem?.category ?? ''
  const variants = [...(product?.variants ?? []), ...customVariants]
  const showQuantity = variants.length === 0 || genericItem !== null
  const foreignAddedBy =
    context === 'list' && noteItem && noteItem.addedBy !== addedBy
      ? noteItem.addedBy
      : null

  const isVariantSelected = (variantName: string) =>
    groupItems.some((item) => item.id === variantItemId(productId, variantName))

  const toggleVariant = (variantName: string) => {
    const itemId = variantItemId(productId, variantName)
    if (isVariantSelected(variantName)) {
      dispatch(itemRemoved({ listId, itemId }))
      return
    }
    dispatch(
      itemAdded({
        listId,
        itemId,
        name: variantName,
        quantity: 1,
        unit,
        category: categoryId,
        addedBy,
        parentId: productId,
      }),
    )
  }

  const setGenericQuantity = (quantity: number) => {
    if (quantity < 1) return
    if (genericItem) {
      dispatch(itemUpdated({ listId, itemId: productId, quantity }))
      return
    }
    dispatch(
      itemAdded({
        listId,
        itemId: productId,
        name,
        quantity,
        unit,
        category: categoryId,
        addedBy,
      }),
    )
  }

  const addCustomVariant = () => {
    const trimmed = customVariantName.trim()
    if (!trimmed) return
    dispatch(customVariantAdded({ listId, productId, variantName: trimmed }))
    toggleVariant(trimmed)
    setCustomVariantName('')
  }

  const commitNote = () => {
    if (!noteItem) return
    if (noteDraft === (noteItem.note ?? '')) return
    dispatch(itemNoteUpdated({ listId, itemId: noteItem.id, note: noteDraft }))
  }

  const removeFromList = () => {
    for (const item of groupItems) {
      dispatch(itemRemoved({ listId, itemId: item.id }))
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background w-full rounded-t-3xl px-6 pt-3 pb-8"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="bg-muted-foreground/30 mx-auto mb-4 h-1 w-10 rounded-full" />

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-secondary flex size-12 items-center justify-center rounded-full text-3xl">
            {emoji}
          </div>
          <div className="flex-1">
            <div className="font-display text-[17px] font-bold">{name}</div>
            <p className="text-muted-foreground text-xs font-medium">
              {unit}
              {foreignAddedBy !== null && ` · von ${foreignAddedBy}`}
            </p>
          </div>
        </div>

        {/* Variant chips */}
        {variants.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {variants.map((variantName) => (
              <button
                key={variantName}
                type="button"
                onClick={() => toggleVariant(variantName)}
                className={cn(
                  'rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-all active:scale-95',
                  isVariantSelected(variantName)
                    ? 'border-teal bg-teal/15 text-teal'
                    : 'border-border bg-secondary text-muted-foreground',
                )}
              >
                {variantName}
              </button>
            ))}
          </div>
        )}

        {/* Custom variant */}
        {variants.length > 0 && (
          <div className="mb-4 flex gap-2">
            <Input
              type="text"
              placeholder="Eigene Sorte hinzufügen..."
              value={customVariantName}
              onChange={(event) => setCustomVariantName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addCustomVariant()
              }}
              className="h-auto rounded-xl px-4 py-2.5 text-sm"
            />
            <Button
              variant="secondary"
              onClick={addCustomVariant}
              className="rounded-xl px-4 font-bold"
            >
              +
            </Button>
          </div>
        )}

        {/* Quantity chips */}
        {showQuantity && (
          <div className="mb-4 flex items-center gap-2">
            {QUANTITY_CHIPS.map((quantity) => (
              <button
                key={quantity}
                type="button"
                onClick={() => setGenericQuantity(quantity)}
                className={cn(
                  'size-10 rounded-xl border text-sm font-bold transition-all active:scale-95',
                  genericItem?.quantity === quantity
                    ? 'border-teal bg-teal/15 text-teal'
                    : 'border-border bg-secondary text-muted-foreground',
                )}
              >
                {quantity}
              </button>
            ))}
            <Input
              type="number"
              min={1}
              placeholder={unit}
              value={
                genericItem &&
                !QUANTITY_CHIPS.some((chip) => chip === genericItem.quantity)
                  ? String(genericItem.quantity)
                  : ''
              }
              onChange={(event) => {
                const parsed = Number(event.target.value)
                if (Number.isFinite(parsed)) setGenericQuantity(parsed)
              }}
              className="h-10 w-20 rounded-xl px-3 text-sm"
            />
          </div>
        )}

        {/* Note — placeholder only, no section label (design/pure rules) */}
        {noteItem && (
          <textarea
            placeholder="Notiz hinzufügen…"
            maxLength={NOTE_MAX_LENGTH}
            rows={2}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            onBlur={commitNote}
            className={cn(
              'border-border bg-secondary w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none',
              'text-muted-foreground focus:text-foreground focus:border-teal',
            )}
          />
        )}

        {/* Remove — list context only */}
        {context === 'list' && groupItems.length > 0 && (
          <Button
            variant="ghost"
            onClick={removeFromList}
            className="mt-3 w-full font-semibold text-[#E07B7B]"
          >
            Von der Liste entfernen
          </Button>
        )}
      </div>
    </div>
  )
}
