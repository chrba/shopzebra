import { createSelector } from '@reduxjs/toolkit'
import { createSlice, type PayloadAction } from '../../../app/createSlice'
import { listDeleted } from '../../lists/domain/listsSlice'
import type { ListItem } from './shoppingDomain'

type ItemsByListId = { readonly [listId: string]: readonly ListItem[] }

type CustomVariantsByListId = {
  readonly [listId: string]: { readonly [productId: string]: readonly string[] }
}

type ShoppingState = {
  readonly itemsByListId: ItemsByListId
  readonly customVariantsByListId: CustomVariantsByListId
}

// --- Slice ---
//
// Action payloads follow the wire format in services/events.md.
// Reducers are replay-pure and total: events targeting unknown lists or
// items are no-ops, never throws (sync-engine.md §5).

const initialState: ShoppingState = {
  itemsByListId: {},
  customVariantsByListId: {},
}

function itemsOf(state: ShoppingState, listId: string): readonly ListItem[] {
  return state.itemsByListId[listId] ?? []
}

function withItems(
  state: ShoppingState,
  listId: string,
  items: readonly ListItem[],
): ShoppingState {
  return {
    ...state,
    itemsByListId: { ...state.itemsByListId, [listId]: items },
  }
}

const shoppingSlice = createSlice({
  name: 'shopping',
  initialState,
  reducers: {
    // Local hydration from clientStorage — not a domain event.
    shoppingLoaded: (
      _state: ShoppingState,
      action: PayloadAction<{
        readonly itemsByListId: ItemsByListId
        readonly customVariantsByListId: CustomVariantsByListId
      }>,
    ): ShoppingState => ({
      itemsByListId: action.payload.itemsByListId,
      customVariantsByListId: action.payload.customVariantsByListId,
    }),

    itemAdded: (
      state: ShoppingState,
      action: PayloadAction<{
        readonly listId: string
        readonly itemId: string
        readonly name: string
        readonly quantity: number
        readonly unit: string
        readonly category: string
        readonly addedBy: string
        readonly parentId?: string
      }>,
    ): ShoppingState => {
      const { listId, itemId } = action.payload
      const items = itemsOf(state, listId)
      const existing = items.find((item) => item.id === itemId)

      // Deterministic item ids collapse duplicate adds: adding an item that
      // is already on the list merges quantities and re-activates it.
      if (existing) {
        return withItems(
          state,
          listId,
          items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  quantity: item.quantity + action.payload.quantity,
                  checked: false,
                }
              : item,
          ),
        )
      }

      const added: ListItem = {
        id: itemId,
        name: action.payload.name,
        quantity: action.payload.quantity,
        unit: action.payload.unit,
        category: action.payload.category,
        checked: false,
        addedBy: action.payload.addedBy,
        ...(action.payload.parentId !== undefined
          ? { parentId: action.payload.parentId }
          : {}),
      }
      return withItems(state, listId, [...items, added])
    },

    itemChecked: (
      state: ShoppingState,
      action: PayloadAction<{
        readonly listId: string
        readonly itemId: string
        readonly checkedBy: string
      }>,
    ): ShoppingState =>
      withItems(
        state,
        action.payload.listId,
        itemsOf(state, action.payload.listId).map((item) =>
          item.id === action.payload.itemId ? { ...item, checked: true } : item,
        ),
      ),

    itemUnchecked: (
      state: ShoppingState,
      action: PayloadAction<{
        readonly listId: string
        readonly itemId: string
      }>,
    ): ShoppingState =>
      withItems(
        state,
        action.payload.listId,
        itemsOf(state, action.payload.listId).map((item) =>
          item.id === action.payload.itemId
            ? { ...item, checked: false }
            : item,
        ),
      ),

    itemRemoved: (
      state: ShoppingState,
      action: PayloadAction<{
        readonly listId: string
        readonly itemId: string
      }>,
    ): ShoppingState =>
      withItems(
        state,
        action.payload.listId,
        itemsOf(state, action.payload.listId).filter(
          (item) => item.id !== action.payload.itemId,
        ),
      ),

    itemUpdated: (
      state: ShoppingState,
      action: PayloadAction<{
        readonly listId: string
        readonly itemId: string
        readonly quantity?: number
        readonly name?: string
      }>,
    ): ShoppingState =>
      withItems(
        state,
        action.payload.listId,
        itemsOf(state, action.payload.listId).map((item) =>
          item.id === action.payload.itemId
            ? {
                ...item,
                quantity: action.payload.quantity ?? item.quantity,
                name: action.payload.name ?? item.name,
              }
            : item,
        ),
      ),

    itemNoteUpdated: (
      state: ShoppingState,
      action: PayloadAction<{
        readonly listId: string
        readonly itemId: string
        readonly note: string
      }>,
    ): ShoppingState =>
      withItems(
        state,
        action.payload.listId,
        itemsOf(state, action.payload.listId).map((item) =>
          item.id === action.payload.itemId
            ? { ...item, note: action.payload.note }
            : item,
        ),
      ),

    customVariantAdded: (
      state: ShoppingState,
      action: PayloadAction<{
        readonly listId: string
        readonly productId: string
        readonly variantName: string
      }>,
    ): ShoppingState => {
      const { listId, productId, variantName } = action.payload
      const listVariants = state.customVariantsByListId[listId] ?? {}
      const productVariants = listVariants[productId] ?? []

      // Duplicate adds must be no-ops so replays stay deterministic.
      if (productVariants.includes(variantName)) return state

      return {
        ...state,
        customVariantsByListId: {
          ...state.customVariantsByListId,
          [listId]: {
            ...listVariants,
            [productId]: [...productVariants, variantName],
          },
        },
      }
    },
  },
  extraReducers: [
    {
      // Items and custom variants of a deleted list are orphans.
      creator: listDeleted,
      reducer: (
        state: ShoppingState,
        action: PayloadAction<{ readonly listId: string }>,
      ): ShoppingState => ({
        itemsByListId: Object.fromEntries(
          Object.entries(state.itemsByListId).filter(
            ([listId]) => listId !== action.payload.listId,
          ),
        ),
        customVariantsByListId: Object.fromEntries(
          Object.entries(state.customVariantsByListId).filter(
            ([listId]) => listId !== action.payload.listId,
          ),
        ),
      }),
    },
  ],
})

// --- Actions ---

export const {
  shoppingLoaded,
  itemAdded,
  itemChecked,
  itemUnchecked,
  itemRemoved,
  itemUpdated,
  itemNoteUpdated,
  customVariantAdded,
} = shoppingSlice.actions
export const shoppingReducer = shoppingSlice.reducer

// --- Selectors ---

type StateWithShopping = { readonly shopping: ShoppingState }

const NO_ITEMS: readonly ListItem[] = []

export const selectListItems = (state: StateWithShopping, listId: string) =>
  state.shopping.itemsByListId[listId] ?? NO_ITEMS

export const selectOpenItems = (state: StateWithShopping, listId: string) =>
  selectListItems(state, listId).filter((item) => !item.checked)

export const selectCheckedItems = (state: StateWithShopping, listId: string) =>
  selectListItems(state, listId).filter((item) => item.checked)

export const selectItemCount = (state: StateWithShopping, listId: string) =>
  selectListItems(state, listId).length

export const selectListProgress = (
  state: StateWithShopping,
  listId: string,
): { readonly total: number; readonly done: number } => {
  const items = selectListItems(state, listId)
  return {
    total: items.length,
    done: items.filter((item) => item.checked).length,
  }
}

export const selectItemCountByListId = createSelector(
  [(state: StateWithShopping) => state.shopping.itemsByListId],
  (itemsByListId) =>
    Object.fromEntries(
      Object.entries(itemsByListId).map(([listId, items]) => [
        listId,
        items.length,
      ]),
    ),
)

const NO_VARIANTS: readonly string[] = []

export const selectCustomVariants = (
  state: StateWithShopping,
  listId: string,
  productId: string,
) => state.shopping.customVariantsByListId[listId]?.[productId] ?? NO_VARIANTS
