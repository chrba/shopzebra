import { createSelector } from '@reduxjs/toolkit'
import { createSlice, type PayloadAction } from '../../../app/createSlice'
import { identityAttached } from '../../auth/domain/authSlice'
import { listDeleted, listLeft } from '../../lists/domain/listsSlice'
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

/** Everything belonging to one list, dropped — on delete and on leave. */
function withoutList(state: ShoppingState, listId: string): ShoppingState {
  return {
    itemsByListId: Object.fromEntries(
      Object.entries(state.itemsByListId).filter(([id]) => id !== listId),
    ),
    customVariantsByListId: Object.fromEntries(
      Object.entries(state.customVariantsByListId).filter(
        ([id]) => id !== listId,
      ),
    ),
  }
}

const shoppingSlice = createSlice({
  name: 'shopping',
  synced: true,
  initialState,
  reducers: {
    // Local hydration from clientStorage — not a domain event.
    shoppingLoaded: {
      role: 'hydration',
      reducer: (
        _state: ShoppingState,
        action: PayloadAction<{
          readonly itemsByListId: ItemsByListId
          readonly customVariantsByListId: CustomVariantsByListId
        }>,
      ): ShoppingState => ({
        itemsByListId: action.payload.itemsByListId,
        customVariantsByListId: action.payload.customVariantsByListId,
      }),
    },

    itemAdded: {
      role: 'event',
      on: 'list',
      reducer: (
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
    },

    itemChecked: {
      role: 'event',
      on: 'list',
      reducer: (
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
            item.id === action.payload.itemId
              ? { ...item, checked: true }
              : item,
          ),
        ),
    },

    itemUnchecked: {
      role: 'event',
      on: 'list',
      reducer: (
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
    },

    itemRemoved: {
      role: 'event',
      on: 'list',
      reducer: (
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
    },

    itemUpdated: {
      role: 'event',
      on: 'list',
      reducer: (
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
    },

    itemNoteUpdated: {
      role: 'event',
      on: 'list',
      reducer: (
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
    },

    customVariantAdded: {
      role: 'event',
      on: 'list',
      reducer: (
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
  },
  extraReducers: [
    {
      // Items and custom variants of a deleted list are orphans.
      creator: listDeleted,
      reducer: (
        state: ShoppingState,
        action: PayloadAction<{ readonly listId: string }>,
      ): ShoppingState => withoutList(state, action.payload.listId),
    },
    {
      // A list I left is gone from this device — its items too.
      creator: listLeft,
      reducer: (
        state: ShoppingState,
        action: PayloadAction<{ readonly listId: string }>,
      ): ShoppingState => withoutList(state, action.payload.listId),
    },
    {
      // Docking: items a guest put on a list were authored by the local
      // sentinel. Left alone, the list view would mark them as somebody
      // else's the moment the device has a real user id.
      creator: identityAttached,
      reducer: (
        state: ShoppingState,
        action: PayloadAction<{
          readonly previousUserId: string
          readonly userId: string
        }>,
      ): ShoppingState => ({
        ...state,
        itemsByListId: Object.fromEntries(
          Object.entries(state.itemsByListId).map(([listId, items]) => [
            listId,
            items.map((item) =>
              item.addedBy === action.payload.previousUserId
                ? { ...item, addedBy: action.payload.userId }
                : item,
            ),
          ]),
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
export const shoppingSyncDeclarations = shoppingSlice.declarations

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
