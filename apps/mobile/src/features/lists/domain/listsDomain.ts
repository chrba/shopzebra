/**
 * A shopping list shared among its members.
 * Synced to the backend — contains only domain data, no UI preferences.
 *
 * ownerId: the creator of the list. Only the owner can invite or remove
 * members (owner model, see architecture/domain-model.md §2).
 */
export type ShoppingList = {
  readonly id: string
  readonly name: string
  readonly ownerId: string
  readonly memberIds: readonly string[]
}
