// An aggregate is a shared thing with its own event log — the boundary that
// order, cursor, membership and sharing all hang on.
// The client knows it only as an identity `{ kind, id }`, because state is
// cut by slice, not by aggregate (the list log feeds lists AND shopping).
// The kinds are declared once, below; everything else in this file reads
// that table. A new kind = one entry here + the slices declaring events on it.

/**
 * Every aggregate kind, with its payload id field and its wire collection.
 * Every entry is synced — a kind belongs here only once its server
 * endpoint exists.
 */
export const AGGREGATE_KINDS = {
  list: { idField: 'listId', collection: 'lists' },
  recipe: { idField: 'recipeId', collection: 'recipes' },
} as const satisfies Record<
  string,
  { readonly idField: string; readonly collection: string }
>

/** The aggregate kinds there are — the same words the server uses. */
export type AggregateKind = keyof typeof AGGREGATE_KINDS

/** The payload field that names an aggregate of kind K (`listId` for `list`). */
export type AggregateIdField<K extends AggregateKind> =
  (typeof AGGREGATE_KINDS)[K]['idField']

/** Identity of one aggregate: which kind, and which one of that kind. */
export type Aggregate = {
  readonly kind: AggregateKind
  readonly id: string
}

function isAggregateKind(value: unknown): value is AggregateKind {
  return typeof value === 'string' && value in AGGREGATE_KINDS
}

/** Every kind, in declaration order. Called by the catch-up fan-out (receive/fetchEvents). */
export const ALL_KINDS: readonly AggregateKind[] =
  Object.keys(AGGREGATE_KINDS).filter(isAggregateKind)

/** The payload field that names an aggregate of this kind. Called by the sync policy to route an event. */
export function idFieldOf(kind: AggregateKind): string {
  return AGGREGATE_KINDS[kind].idField
}

/**
 * Reads an aggregate the server named, or null when it sent something else.
 * Used wherever the server decides which aggregate a call was about — the
 * join endpoint, where the invite token and not the route holds the answer.
 */
export function parseAggregate(value: unknown): Aggregate | null {
  if (value === null || typeof value !== 'object') return null
  const { kind, id } = value as {
    readonly kind?: unknown
    readonly id?: unknown
  }
  if (!isAggregateKind(kind) || typeof id !== 'string') return null
  return { kind, id }
}

/** Where the ids of one kind are listed. Called at the start of a catch-up and by the sharing commands. */
export function collectionPathFor(kind: AggregateKind): string {
  return `/${AGGREGATE_KINDS[kind].collection}`
}

/** The field a collection response carries its ids under. Called by receive/fetchEvents. */
export function collectionKeyOf(kind: AggregateKind): string {
  return AGGREGATE_KINDS[kind].collection
}

/** Event-log endpoint of an aggregate. Called by the sync policy at enqueue time and by catch-up. */
export function eventsPathFor(aggregate: Aggregate): string {
  return `/${AGGREGATE_KINDS[aggregate.kind].collection}/${aggregate.id}/events`
}

/**
 * Key an aggregate's cursor is stored under. Includes the kind: two kinds
 * may hand out the same id, and their logs must never share a cursor.
 */
export function cursorKeyOf(aggregate: Aggregate): string {
  return `${aggregate.kind}:${aggregate.id}`
}
