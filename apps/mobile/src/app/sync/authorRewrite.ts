// Docking: the one-time rewrite of authorship, applied when a device that
// has been writing under the local sentinel gains its real Cognito sub
// (architecture/accountless-first-planned.md). Pure — the queue and the
// folded state each apply it in their own place.

import type { OutboxEntry } from './outbox'

// Fields that name a person, and only these. A value-based replace would
// corrupt user content that happens to equal the sentinel — a list called
// "local-user" is a legitimate name.
const AUTHOR_FIELDS: ReadonlySet<string> = new Set([
  'createdBy',
  'ownerId',
  'userId',
  'memberId',
  'addedBy',
  'checkedBy',
])

const AUTHOR_LIST_FIELDS: ReadonlySet<string> = new Set(['memberIds'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep copy with every author field that names `previousUserId` moved on. */
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
 * The same rewrite for one queued send. Only the payload is touched: the
 * envelope's meta carries no author, the server derives it from the JWT.
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
