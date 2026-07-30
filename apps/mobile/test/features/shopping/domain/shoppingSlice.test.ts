import { describe, expect, it } from 'vitest'
import {
  customVariantAdded,
  itemAdded,
  itemChecked,
  itemNoteUpdated,
  itemRemoved,
  itemUnchecked,
  itemUpdated,
  selectCheckedItems,
  selectCustomVariants,
  selectItemCount,
  selectListItems,
  selectListProgress,
  selectOpenItems,
  shoppingReducer,
} from '@/features/shopping/domain/shoppingSlice'
import { listDeleted } from '@/features/lists/domain/listsSlice'

// Behavior-level tests through public actions and selectors — no mocks.
// Payloads follow the wire format in services/events.md.

type ShoppingRootState = Parameters<typeof selectListItems>[0]

const initialization = { type: '@@INIT' }

function rootStateAfter(
  ...actions: readonly { readonly type: string }[]
): ShoppingRootState {
  const sliceState = actions.reduce(
    (state, action) => shoppingReducer(state, action),
    shoppingReducer(undefined, initialization),
  )
  return { shopping: sliceState }
}

const applesAdded = itemAdded({
  listId: 'groceries',
  itemId: 'apples',
  name: 'Äpfel',
  quantity: 2,
  unit: 'kg',
  category: 'fruits-vegetables',
  addedBy: 'mama',
})

const elstarAdded = itemAdded({
  listId: 'groceries',
  itemId: 'apples--Elstar',
  name: 'Elstar',
  quantity: 1,
  unit: 'kg',
  category: 'fruits-vegetables',
  addedBy: 'papa',
  parentId: 'apples',
})

describe('shoppingSlice — Items verwalten', () => {
  it('startet ohne Items', () => {
    const state = rootStateAfter()

    expect(selectListItems(state, 'groceries')).toEqual([])
    expect(selectItemCount(state, 'groceries')).toBe(0)
  })

  it('itemAdded macht das Item über Selektoren sichtbar', () => {
    const state = rootStateAfter(applesAdded)

    expect(selectListItems(state, 'groceries')).toEqual([
      {
        id: 'apples',
        name: 'Äpfel',
        quantity: 2,
        unit: 'kg',
        category: 'fruits-vegetables',
        checked: false,
        addedBy: 'mama',
      },
    ])
  })

  it('Items verschiedener Listen bleiben getrennt', () => {
    const state = rootStateAfter(applesAdded)

    expect(selectItemCount(state, 'groceries')).toBe(1)
    expect(selectItemCount(state, 'other-list')).toBe(0)
  })

  it('doppeltes itemAdded kollabiert: Mengen summieren, Item wird wieder aktiv', () => {
    const state = rootStateAfter(
      applesAdded,
      itemChecked({ listId: 'groceries', itemId: 'apples', checkedBy: 'papa' }),
      applesAdded,
    )

    const items = selectListItems(state, 'groceries')
    expect(items).toHaveLength(1)
    expect(items[0]?.quantity).toBe(4)
    expect(items[0]?.checked).toBe(false)
  })

  it('Varianten sind eigenständige Items mit parentId', () => {
    const state = rootStateAfter(applesAdded, elstarAdded)

    expect(selectItemCount(state, 'groceries')).toBe(2)
    const elstar = selectListItems(state, 'groceries').find(
      (item) => item.id === 'apples--Elstar',
    )
    expect(elstar?.parentId).toBe('apples')
  })
})

describe('shoppingSlice — Abhaken', () => {
  it('itemChecked hakt ab, itemUnchecked stellt wieder her', () => {
    const checked = rootStateAfter(
      applesAdded,
      itemChecked({ listId: 'groceries', itemId: 'apples', checkedBy: 'papa' }),
    )
    expect(selectOpenItems(checked, 'groceries')).toEqual([])
    expect(selectCheckedItems(checked, 'groceries')).toHaveLength(1)

    const restored = rootStateAfter(
      applesAdded,
      itemChecked({ listId: 'groceries', itemId: 'apples', checkedBy: 'papa' }),
      itemUnchecked({ listId: 'groceries', itemId: 'apples' }),
    )
    expect(selectOpenItems(restored, 'groceries')).toHaveLength(1)
  })

  it('selectListProgress zählt erledigte und gesamte Items', () => {
    const state = rootStateAfter(
      applesAdded,
      elstarAdded,
      itemChecked({ listId: 'groceries', itemId: 'apples', checkedBy: 'papa' }),
    )

    expect(selectListProgress(state, 'groceries')).toEqual({
      total: 2,
      done: 1,
    })
  })

  it('itemChecked auf unbekannte IDs ändert nichts (total)', () => {
    const state = rootStateAfter(
      applesAdded,
      itemChecked({
        listId: 'groceries',
        itemId: 'unknown',
        checkedBy: 'papa',
      }),
      itemChecked({
        listId: 'unknown-list',
        itemId: 'apples',
        checkedBy: 'papa',
      }),
    )

    expect(selectCheckedItems(state, 'groceries')).toEqual([])
  })
})

describe('shoppingSlice — Ändern und Entfernen', () => {
  it('itemUpdated ändert nur die übergebenen Felder', () => {
    const state = rootStateAfter(
      applesAdded,
      itemUpdated({ listId: 'groceries', itemId: 'apples', quantity: 5 }),
    )

    const apples = selectListItems(state, 'groceries')[0]
    expect(apples?.quantity).toBe(5)
    expect(apples?.name).toBe('Äpfel')
  })

  it('itemNoteUpdated setzt die Notiz', () => {
    const state = rootStateAfter(
      applesAdded,
      itemNoteUpdated({
        listId: 'groceries',
        itemId: 'apples',
        note: 'nur Bio',
      }),
    )

    expect(selectListItems(state, 'groceries')[0]?.note).toBe('nur Bio')
  })

  it('itemRemoved entfernt genau das Ziel-Item', () => {
    const state = rootStateAfter(
      applesAdded,
      elstarAdded,
      itemRemoved({ listId: 'groceries', itemId: 'apples' }),
    )

    expect(selectListItems(state, 'groceries').map((item) => item.id)).toEqual([
      'apples--Elstar',
    ])
  })
})

describe('shoppingSlice — Custom Variants', () => {
  it('customVariantAdded erweitert den Katalog pro Liste', () => {
    const state = rootStateAfter(
      customVariantAdded({
        listId: 'groceries',
        productId: 'apples',
        variantName: 'Honeycrisp',
      }),
    )

    expect(selectCustomVariants(state, 'groceries', 'apples')).toEqual([
      'Honeycrisp',
    ])
    expect(selectCustomVariants(state, 'other-list', 'apples')).toEqual([])
  })

  it('doppeltes customVariantAdded ist ein No-op (replay-sicher)', () => {
    const add = customVariantAdded({
      listId: 'groceries',
      productId: 'apples',
      variantName: 'Honeycrisp',
    })
    const state = rootStateAfter(add, add)

    expect(selectCustomVariants(state, 'groceries', 'apples')).toEqual([
      'Honeycrisp',
    ])
  })
})

describe('shoppingSlice — Reducer-Kontrakt', () => {
  it('reagiert auf listDeleted aus der lists-Domain und räumt auf', () => {
    const state = rootStateAfter(
      applesAdded,
      customVariantAdded({
        listId: 'groceries',
        productId: 'apples',
        variantName: 'Honeycrisp',
      }),
      listDeleted({ listId: 'groceries' }),
    )

    expect(selectListItems(state, 'groceries')).toEqual([])
    expect(selectCustomVariants(state, 'groceries', 'apples')).toEqual([])
  })

  it('unbekannte Actions lassen den State referenzgleich', () => {
    const before = rootStateAfter(applesAdded).shopping
    const after = shoppingReducer(before, { type: 'somewhere/else' })

    expect(after).toBe(before)
  })

  it('dieselbe Event-Folge ergibt denselben State (replay-pur)', () => {
    const eventSequence = [
      applesAdded,
      elstarAdded,
      itemChecked({ listId: 'groceries', itemId: 'apples', checkedBy: 'papa' }),
      itemUpdated({
        listId: 'groceries',
        itemId: 'apples--Elstar',
        quantity: 3,
      }),
      itemRemoved({ listId: 'groceries', itemId: 'apples' }),
    ]

    expect(rootStateAfter(...eventSequence)).toEqual(
      rootStateAfter(...eventSequence),
    )
  })
})
