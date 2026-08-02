// Everything the engine knows about aggregates lives in this file.
// A new aggregate kind (plans) extends these tables — nothing else.

import type { PayloadAction } from '../createSlice'

/** The aggregate kinds there are — the same words the server uses. */
export type AggregateKind = 'list' | 'recipe' | 'plan'

/** Identity of one aggregate: which kind, and which one of that kind. */
export type Aggregate = {
  readonly kind: AggregateKind
  readonly id: string
}

/**
 * How each kind names itself in an event payload. Every event of a list
 * aggregate carries a `listId`, whichever slice dispatched it; recipes
 * carry a `recipeId` (services/events.md).
 */
const ID_FIELD_OF: Readonly<Record<AggregateKind, string>> = {
  list: 'listId',
  recipe: 'recipeId',
  plan: 'planId',
}

/** How each kind names itself in a route — and in its collection response. */
const COLLECTION_OF: Readonly<Record<AggregateKind, string>> = {
  list: 'lists',
  recipe: 'recipes',
  plan: 'plans',
}

/**
 * The kinds the catch-up fans out over. Plans have no endpoint yet — they
 * join this list the day they get one, and nothing else has to change.
 */
export const SYNCED_KINDS: readonly AggregateKind[] = ['list', 'recipe']

const ALL_KINDS: readonly AggregateKind[] = ['list', 'recipe', 'plan']

function isAggregateKind(value: unknown): value is AggregateKind {
  return ALL_KINDS.some((kind) => kind === value)
}

/**
 * Reads an aggregate the server named, or null when it sent something else.
 * Used wherever the server decides which aggregate a call was about — the
 * join endpoint, where the invite token and not the route holds the answer.
 */
export function parseAggregate(value: unknown): Aggregate | null {
  if (value === null || typeof value !== 'object') return null
  const { kind, id } = value as { readonly kind?: unknown; readonly id?: unknown }
  if (!isAggregateKind(kind) || typeof id !== 'string') return null
  return { kind, id }
}

/**
 * Aggregate a synced action belongs to, or null for local-only actions
 * (e.g. hydration), which carry no aggregate id at all.
 */
export function aggregateOf(action: PayloadAction<unknown>): Aggregate | null {
  const payload = action.payload
  if (payload === null || typeof payload !== 'object') return null
  const fields = payload as Readonly<Record<string, unknown>>
  for (const kind of ALL_KINDS) {
    const id = fields[ID_FIELD_OF[kind]]
    if (typeof id === 'string') return { kind, id }
  }
  return null
}

/** Where the ids of one kind are listed. Called at the start of a catch-up. */
export function collectionPathFor(kind: AggregateKind): string {
  return `/${COLLECTION_OF[kind]}`
}

/** The field a collection response carries its ids under. */
export function collectionKeyOf(kind: AggregateKind): string {
  return COLLECTION_OF[kind]
}

/** Event-log endpoint of an aggregate. Called at enqueue time and by catch-up. */
export function eventsPathFor(aggregate: Aggregate): string {
  return `/${COLLECTION_OF[aggregate.kind]}/${aggregate.id}/events`
}

/**
 * Key an aggregate's cursor is stored under. Includes the kind: two kinds
 * may hand out the same id, and their logs must never share a cursor.
 */
export function cursorKeyOf(aggregate: Aggregate): string {
  return `${aggregate.kind}:${aggregate.id}`
}
