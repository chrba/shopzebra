// Docking: moving everything a guest wrote onto the account it just got.
//
// The app starts without one, so early events name their author with a
// placeholder id — `local-user`:
//
//   listCreated { listId: 'l1', name: 'REWE',  ownerId:  'local-user' }
//   itemAdded   { listId: 'l1', itemId: 'milk', addedBy: 'local-user' }
//
// At the first share a shadow account appears and the device gets a real id.
// The placeholder has to go, or the server rejects the queued events: it
// derives the author from the JWT and refuses a payload claiming somebody
// else wrote it. Locally the user would not even be a member of their own list.
//
// The placeholder sits in three places, and ensureIdentity rewrites all three
// before any cycle may run: the outbox on disk (via withRewrittenAuthor), the
// folded trees (identityAttached, each slice folds it), and the reducer's
// pending queue (pendingAuthorRewritten). Skipping the last one was a real
// bug: the next rebase replays pending over confirmed and brings the
// placeholder back.

import type { OutboxEntry } from './outbox'

// Fields that name a person, and only these. Replacing the id wherever it
// appears would corrupt content: a list *called* "local-user" is a legitimate
// name and must survive.
const AUTHOR_FIELDS: ReadonlySet<string> = new Set([
  'createdBy',
  'ownerId',
  'userId',
  'memberId',
  'addedBy',
  'checkedBy',
])

/** Author fields holding several ids at once. */
const AUTHOR_LIST_FIELDS: ReadonlySet<string> = new Set(['memberIds'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deep copy of a payload with every author field moved to the new id.
 * Recursive because payloads nest — a recipe carries ingredients, a list
 * carries memberIds. Anything that is not an author field is copied as is.
 *
 *   { name: 'local-user', ownerId: 'local-user' }, 'local-user', 'a3f9'
 *     → { name: 'local-user', ownerId: 'a3f9' }
 *
 * Called by withRewrittenAuthor for queued sends, and by withSync for the
 * pending queue (pendingAuthorRewritten).
 *
 * @param value Any payload or nested part of one.
 * @param previousUserId The id being left behind, in practice `local-user`.
 * @param userId The account id the device just got.
 * @returns A copy; the input is untouched.
 */
export function withRewrittenAuthorFields(
  value: unknown,
  previousUserId: string,
  userId: string,
): unknown {
  if (Array.isArray(value)) {
    return value.map((element) =>
      withRewrittenAuthorFields(element, previousUserId, userId),
    )
  }
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (AUTHOR_FIELDS.has(key) && entry === previousUserId) {
        return [key, userId]
      }
      if (AUTHOR_LIST_FIELDS.has(key) && Array.isArray(entry)) {
        return [key, entry.map((id) => (id === previousUserId ? userId : id))]
      }
      return [key, withRewrittenAuthorFields(entry, previousUserId, userId)]
    }),
  )
}

/**
 * The same rewrite for one queued send. Only the payload changes — `path`
 * names an aggregate, not a person, and `meta` carries no author at all
 * (the server takes it from the JWT).
 *
 * Called by Outbox.rewriteAuthor for every queued entry, and by the engine
 * for the entries still buffered before the outbox was open.
 *
 * @param entry One queued send, `{ path, wire }`.
 * @param previousUserId The id being left behind, in practice `local-user`.
 * @param userId The account id the device just got.
 * @returns A copy of the entry with the rewritten payload.
 */
export function withRewrittenAuthor(
  entry: OutboxEntry,
  previousUserId: string,
  userId: string,
): OutboxEntry {
  return {
    ...entry,
    wire: {
      ...entry.wire,
      payload: withRewrittenAuthorFields(
        entry.wire.payload,
        previousUserId,
        userId,
      ),
    },
  }
}
