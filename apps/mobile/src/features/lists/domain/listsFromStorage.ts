import type { ShoppingList } from './listsDomain'

/**
 * The lists as they come back from the device at boot — the read
 * counterpart of listsClientStorageHandler.
 *
 * Entries are rebuilt field by field rather than trusted wholesale: what
 * lies on the device was written by an older version of this app and may
 * predate fields that exist today. Anything added here must also be listed
 * here, or it is silently lost between two starts — that is exactly how
 * member names disappeared and shared lists read "Mitglied".
 */
export function listsFromStorage(parsed: unknown): readonly ShoppingList[] {
  if (!Array.isArray(parsed)) return []

  const stored = parsed as readonly Partial<ShoppingList>[]
  return stored.flatMap((entry) => {
    if (!entry.id || !entry.name) return []
    const list: ShoppingList = {
      id: entry.id,
      name: entry.name,
      // Lists written before the owner model have no ownerId.
      ownerId: entry.ownerId ?? entry.memberIds?.[0] ?? 'unknown',
      memberIds: entry.memberIds ?? [],
    }
    // Spread rather than assign undefined: memberNames is optional, and
    // under exactOptionalPropertyTypes "absent" and "undefined" differ.
    return [
      entry.memberNames ? { ...list, memberNames: entry.memberNames } : list,
    ]
  })
}
