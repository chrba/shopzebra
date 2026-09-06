// The membership lifecycle end to end: joining, leaving, being removed and
// deleting a shared list, each driven through the real sync engine against
// an in-memory server. These are the round trips the unit tests around
// listsSlice and leaveList cannot see, because they never let a catch-up
// run after the local fold — and the catch-up is where leaving used to be
// undone.

import { describe, expect, test } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'
import { cursorKeyOf, type Aggregate } from '@/app/sync/aggregate'
import type { OutboxEntry, SyncStorage } from '@/app/sync/outbox'
import { SyncEngine } from '@/app/sync/syncEngine'
import type { SendResult, Transport, WireEvent } from '@/app/sync/transport'
import { withSync } from '@/app/sync/withSync'
import type { Fetcher } from '@/app/authFetch'
import { leaveList } from '@/features/lists/domain/leaveList'
import {
  listDeleted,
  listDropped,
  listsLoaded,
  listsReducer,
  selectAllLists,
} from '@/features/lists/domain/listsSlice'
import {
  selectListItems,
  shoppingReducer,
} from '@/features/shopping/domain/shoppingSlice'
import type { ShoppingList } from '@/features/lists/domain/listsDomain'

// --- The device's store, composed the way app/store.ts composes it ---

type FeatureState = {
  readonly lists: ReturnType<typeof listsReducer>
  readonly shopping: ReturnType<typeof shoppingReducer>
}

function featureReducer(
  state: FeatureState | undefined,
  action: PayloadAction<unknown>,
): FeatureState {
  return {
    lists: listsReducer(state?.lists, action),
    shopping: shoppingReducer(state?.shopping, action),
  }
}

const syncReducer = withSync<FeatureState>(
  featureReducer,
  appSyncPolicy.reachesServer,
)

// --- The server, in memory ---

function positionOf(sequence: number): string {
  return String(sequence).padStart(20, '0')
}

type AppendableEvent = {
  readonly type: string
  readonly payload: Record<string, unknown>
  readonly meta: Omit<WireEvent['meta'], 'position'>
}

/**
 * An event log per aggregate plus the server-owned membership projection —
 * enough of the backend to drive whole round trips. Nothing here folds
 * anything: the server stores events and answers who may see what.
 */
class Backend {
  private readonly logs = new Map<string, readonly WireEvent[]>()
  private readonly members = new Map<string, ReadonlySet<string>>()
  private sequence = 0

  /** Pairs of aggregate and user the collection still names although the membership is gone. */
  private lagging: ReadonlySet<string> = new Set()

  private listCollectionReadable = true

  append(aggregate: Aggregate, event: AppendableEvent): void {
    this.sequence += 1
    const key = cursorKeyOf(aggregate)
    const stored: WireEvent = {
      type: event.type,
      payload: event.payload,
      meta: { ...event.meta, position: positionOf(this.sequence) },
    }
    this.logs.set(key, [...(this.logs.get(key) ?? []), stored])
  }

  addMember(aggregate: Aggregate, userId: string): void {
    const key = cursorKeyOf(aggregate)
    this.members.set(key, new Set([...(this.members.get(key) ?? []), userId]))
  }

  removeMember(aggregate: Aggregate, userId: string): void {
    const key = cursorKeyOf(aggregate)
    const remaining = new Set(this.members.get(key) ?? [])
    remaining.delete(userId)
    this.members.set(key, remaining)
  }

  /** The collection keeps naming the aggregate although the membership is already gone — the byUser index is eventually consistent. */
  letTheProjectionLag(aggregate: Aggregate, userId: string): void {
    this.lagging = new Set([
      ...this.lagging,
      `${cursorKeyOf(aggregate)}#${userId}`,
    ])
  }

  letTheProjectionCatchUp(): void {
    this.lagging = new Set()
  }

  private aggregatesOf(userId: string): readonly Aggregate[] {
    return [...this.members.keys()]
      .filter(
        (key) =>
          (this.members.get(key)?.has(userId) ?? false) ||
          this.lagging.has(`${key}#${userId}`),
      )
      .map((key) => aggregateOfKey(key))
  }

  private eventsSince(
    aggregate: Aggregate,
    since: string | null,
  ): readonly WireEvent[] {
    const log = this.logs.get(cursorKeyOf(aggregate)) ?? []
    return since === null
      ? log
      : log.filter((event) => event.meta.position > since)
  }

  /** The transport one device talks to the server through. */
  transportFor(userId: string): Transport {
    return {
      sendEntry: (entry: OutboxEntry) => {
        const aggregate = aggregateOfEventsPath(entry.path)
        if (
          !aggregate ||
          !(this.members.get(cursorKeyOf(aggregate))?.has(userId) ?? false)
        ) {
          return Promise.resolve<SendResult>({
            outcome: 'rejected',
            status: 403,
          })
        }
        this.append(aggregate, {
          type: entry.wire.type,
          payload: asRecord(entry.wire.payload),
          meta: {
            eventId: entry.wire.meta?.eventId ?? '',
            deviceId: entry.wire.meta?.deviceId ?? '',
            userId,
          },
        })
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      fetchAggregates: () => Promise.resolve(this.aggregatesOf(userId)),
      listCollections: () =>
        Promise.resolve(
          this.listCollectionReadable
            ? [{ kind: 'list' as const, named: this.aggregatesOf(userId) }]
            : [],
        ),
      fetchEventsSince: (aggregate, since) =>
        Promise.resolve(this.eventsSince(aggregate, since)),
    }
  }

  /** GET /lists stops answering — a 500, an expired token, a captive portal. */
  breakTheListCollection(): void {
    this.listCollectionReadable = false
  }

  mendTheListCollection(): void {
    this.listCollectionReadable = true
  }
}

function asRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? { ...(payload as Record<string, unknown>) }
    : {}
}

function aggregateOfKey(key: string): Aggregate {
  const [kind, id] = key.split(':')
  return { kind: kind === 'recipe' ? 'recipe' : 'list', id: id ?? '' }
}

function aggregateOfEventsPath(path: string): Aggregate | null {
  const match = /^\/(lists|recipes)\/([^/]+)\/events$/.exec(path)
  if (!match) return null
  return {
    kind: match[1] === 'recipes' ? 'recipe' : 'list',
    id: match[2] ?? '',
  }
}

// --- One device ---

/** clientStorage in a Map, shared across a restart of the same device. */
function memoryStorage(): SyncStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

/** Lets every queued promise settle — the engine works through microtasks. */
async function settle(): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    await Promise.resolve()
  }
}

type Device = {
  readonly start: () => Promise<void>
  readonly sync: () => Promise<void>
  readonly dispatch: (action: PayloadAction<unknown>) => void
  readonly leave: (listId: string, fetcher: Fetcher) => Promise<void>
  readonly listIds: () => readonly string[]
  readonly itemIds: (listId: string) => readonly string[]
  /** What clientStorage would hold — the tree a restart hydrates from. */
  readonly confirmedLists: () => readonly ShoppingList[]
}

function deviceOf(
  backend: Backend,
  userId: string,
  deviceId: string,
  storage: SyncStorage = memoryStorage(),
  hydrateWith: readonly ShoppingList[] = [],
): Device {
  const engine = new SyncEngine(
    storage,
    backend.transportFor(userId),
    appSyncPolicy,
  )
  let state = syncReducer(undefined, { type: '@@INIT', payload: undefined })

  // The app's eventIdMiddleware stamps every own action; the sync policy
  // only counts an action as this device's when it carries meta.
  const stamp = (action: PayloadAction<unknown>): PayloadAction<unknown> =>
    action.meta === undefined
      ? { ...action, meta: { eventId: crypto.randomUUID(), deviceId } }
      : action

  // syncMiddleware offers every dispatched action to the engine.
  const plainDispatch = (action: PayloadAction<unknown>): void => {
    state = syncReducer(state, action)
    engine.offer(action)
  }

  if (hydrateWith.length > 0) {
    plainDispatch(stamp(listsLoaded({ lists: hydrateWith })))
  }

  const getState = () => ({
    ...state.visible,
    auth: { identity: { kind: 'guest', userId, name: 'Kicherzebra' } },
    app: { deviceId, theme: 'dark', initialSyncDone: true },
    sync: { confirmed: state.confirmed, pending: state.pending },
  })

  const thunkDispatch = (action: unknown): unknown => {
    if (typeof action === 'function') {
      return (action as (d: unknown, g: unknown) => unknown)(
        thunkDispatch,
        getState,
      )
    }
    plainDispatch(stamp(action as PayloadAction<unknown>))
    return action
  }

  const holdings = {
    heldAggregates: (): readonly Aggregate[] =>
      selectAllLists(getState()).map((list) => ({
        kind: 'list' as const,
        id: list.id,
      })),
    dropAggregate: (aggregate: Aggregate) =>
      plainDispatch(stamp(listDropped({ listId: aggregate.id }))),
  }

  return {
    start: async () => {
      await engine.start((action) => plainDispatch(action), holdings)
      await settle()
    },
    sync: async () => {
      await settle()
      await engine.requestSync()
      await settle()
    },
    dispatch: (action) => plainDispatch(stamp(action)),
    leave: (listId, fetcher) =>
      thunkDispatch(leaveList(listId, fetcher)) as Promise<void>,
    listIds: () => selectAllLists(getState()).map((list) => list.id),
    itemIds: (listId) =>
      selectListItems(getState(), listId).map((item) => item.id),
    confirmedLists: () => selectAllLists(state.confirmed),
  }
}

// --- A shared list, as it exists once eiszebra shared it ---

const groceries: Aggregate = { kind: 'list', id: 'l1' }

function ownedByEiszebra(backend: Backend): void {
  backend.addMember(groceries, 'eiszebra')
  backend.append(groceries, {
    type: 'lists/listCreated',
    payload: { listId: 'l1', name: 'Wocheneinkauf', createdBy: 'eiszebra' },
    meta: { eventId: 'created', deviceId: 'd-eiszebra', userId: 'eiszebra' },
  })
  backend.append(groceries, {
    type: 'shopping/itemAdded',
    payload: {
      listId: 'l1',
      itemId: 'milk',
      name: 'Milch',
      quantity: 1,
      unit: 'l',
      category: 'dairy',
      addedBy: 'eiszebra',
    },
    meta: { eventId: 'item', deviceId: 'd-eiszebra', userId: 'eiszebra' },
  })
}

/** What POST /lists/join leaves behind: a membership and the member-added event. */
function invited(backend: Backend, memberId: string, eventId: string): void {
  backend.addMember(groceries, memberId)
  backend.append(groceries, {
    type: 'lists/listMemberAdded',
    payload: { listId: 'l1', memberId, name: 'Kicherzebra' },
    meta: { eventId, deviceId: 'd-server', userId: 'eiszebra' },
  })
}

function sharedWith(backend: Backend, memberId: string): void {
  ownedByEiszebra(backend)
  invited(backend, memberId, 'joined')
}

/** DELETE /lists/l1/members/me, as the server answers it. */
function removalAccepted(backend: Backend): Fetcher {
  return () => {
    backend.append(groceries, {
      type: 'lists/listMemberRemoved',
      payload: { listId: 'l1', memberId: 'me' },
      meta: { eventId: 'left', deviceId: 'd-me', userId: 'me' },
    })
    backend.removeMember(groceries, 'me')
    return Promise.resolve(new Response(null, { status: 200 }))
  }
}

const refusing =
  (status: number): Fetcher =>
  () =>
    Promise.resolve(new Response(null, { status }))

// --- Leaving ---

describe('a member leaves a list somebody else shared with them', () => {
  test('the list is gone at once and stays gone across a catch-up', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const member = deviceOf(backend, 'me', 'd-me')
    await member.start()
    expect(member.listIds()).toEqual(['l1'])

    await member.leave('l1', removalAccepted(backend))
    expect(member.listIds()).toEqual([])

    await member.sync()
    expect(member.listIds()).toEqual([])
  })

  // The membership projection is a secondary index: right after the server
  // accepted the removal it still names the list. A catch-up in that window
  // used to fold the whole log again — listCreated included — and the tile
  // was back, which is what "leaving does nothing" looks like from outside.
  test('stays gone while the membership projection still names it', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const member = deviceOf(backend, 'me', 'd-me')
    await member.start()

    await member.leave('l1', () => {
      backend.letTheProjectionLag(groceries, 'me')
      return removalAccepted(backend)('', {})
    })
    expect(member.listIds()).toEqual([])

    await member.sync()

    expect(member.listIds()).toEqual([])
    expect(member.itemIds('l1')).toEqual([])
  })

  // The device is closed inside that same window. Whatever says "I let go
  // of this" has to outlive the process, or the first cycle after the
  // restart puts the list back.
  test('stays gone after a restart inside that window', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const storage = memoryStorage()
    const member = deviceOf(backend, 'me', 'd-me', storage)
    await member.start()

    await member.leave('l1', () => {
      backend.letTheProjectionLag(groceries, 'me')
      return removalAccepted(backend)('', {})
    })
    const survivingTree = member.confirmedLists()
    expect(survivingTree).toEqual([])

    const restarted = deviceOf(backend, 'me', 'd-me', storage, survivingTree)
    await restarted.start()

    expect(restarted.listIds()).toEqual([])
  })

  // A refused removal is not a leave: the membership still exists, so the
  // list comes back — and it has to keep syncing afterwards.
  test('comes back when the server refuses, and syncs again', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const member = deviceOf(backend, 'me', 'd-me')
    await member.start()

    const refused = await member.leave('l1', refusing(500)).then(
      () => false,
      () => true,
    )
    expect(refused).toBe(true)
    expect(member.listIds()).toEqual(['l1'])

    backend.append(groceries, {
      type: 'lists/listRenamed',
      payload: { listId: 'l1', name: 'Großeinkauf' },
      meta: { eventId: 'renamed', deviceId: 'd-eiszebra', userId: 'eiszebra' },
    })
    await member.sync()

    expect(member.listIds()).toEqual(['l1'])
  })

  // Letting go must not be forever: a new invitation is the one thing that
  // brings the list back, and it has to fold from the very first event.
  test('comes back when the owner invites them again', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const member = deviceOf(backend, 'me', 'd-me')
    await member.start()

    await member.leave('l1', removalAccepted(backend))
    await member.sync()
    expect(member.listIds()).toEqual([])

    backend.letTheProjectionCatchUp()
    invited(backend, 'me', 'joined-again')
    await member.sync()

    expect(member.listIds()).toEqual(['l1'])
    expect(member.itemIds('l1')).toEqual(['milk'])
  })
})

// --- Deleting ---

describe('the owner deletes a shared list', () => {
  test('it disappears for the owner and stays gone across catch-ups', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const owner = deviceOf(backend, 'eiszebra', 'd-eiszebra')
    await owner.start()
    expect(owner.listIds()).toEqual(['l1'])

    owner.dispatch(listDeleted({ listId: 'l1' }))
    expect(owner.listIds()).toEqual([])

    await owner.sync()
    // The confirmed tree is what a restart hydrates from, so the delete
    // has to have reached it — not just the optimistic one.
    expect(owner.confirmedLists()).toEqual([])

    await owner.sync()
    expect(owner.listIds()).toEqual([])
  })

  test('it disappears for every member too', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const owner = deviceOf(backend, 'eiszebra', 'd-eiszebra')
    const member = deviceOf(backend, 'me', 'd-me')
    await owner.start()
    await member.start()
    expect(member.listIds()).toEqual(['l1'])

    owner.dispatch(listDeleted({ listId: 'l1' }))
    await owner.sync()

    await member.sync()
    expect(member.listIds()).toEqual([])
    expect(member.itemIds('l1')).toEqual([])
    expect(member.confirmedLists()).toEqual([])

    await member.sync()
    expect(member.listIds()).toEqual([])
  })
})

// --- Being removed ---

describe('a member the owner removed', () => {
  // Being removed is the one membership change whose event never reaches
  // the removed device — access ends with it. Absence from the collection
  // is the only signal there is.
  test('loses the list on the next catch-up', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const member = deviceOf(backend, 'me', 'd-me')
    await member.start()
    expect(member.listIds()).toEqual(['l1'])

    backend.removeMember(groceries, 'me')
    await member.sync()

    expect(member.listIds()).toEqual([])
  })

  test('gets it back when the owner invites them again', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const member = deviceOf(backend, 'me', 'd-me')
    await member.start()

    backend.removeMember(groceries, 'me')
    await member.sync()
    expect(member.listIds()).toEqual([])

    invited(backend, 'me', 'joined-again')
    await member.sync()

    expect(member.listIds()).toEqual(['l1'])
    expect(member.itemIds('l1')).toEqual(['milk'])
  })

  test('the other members keep the list when one leaves', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const owner = deviceOf(backend, 'eiszebra', 'd-eiszebra')
    const member = deviceOf(backend, 'me', 'd-me')
    await owner.start()
    await member.start()

    await member.leave('l1', removalAccepted(backend))
    await member.sync()
    await owner.sync()

    expect(member.listIds()).toEqual([])
    expect(owner.listIds()).toEqual(['l1'])
    expect(owner.itemIds('l1')).toEqual(['milk'])
  })
})

// --- When the collection cannot be read at all ---

describe('a list collection that cannot be read', () => {
  test('never costs the device the lists it holds', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const member = deviceOf(backend, 'me', 'd-me')
    await member.start()
    expect(member.listIds()).toEqual(['l1'])

    backend.breakTheListCollection()
    await member.sync()

    expect(member.listIds()).toEqual(['l1'])
    expect(member.itemIds('l1')).toEqual(['milk'])
  })

  // Silence settles nothing either. If a failed listing counted as "the
  // server no longer names it", the leave would be forgotten and the very
  // next healthy cycle — still inside the projection's lag — would fold the
  // list back in.
  test('does not settle a leave the server has not confirmed yet', async () => {
    const backend = new Backend()
    sharedWith(backend, 'me')
    const member = deviceOf(backend, 'me', 'd-me')
    await member.start()

    await member.leave('l1', () => {
      backend.letTheProjectionLag(groceries, 'me')
      return removalAccepted(backend)('', {})
    })
    expect(member.listIds()).toEqual([])

    backend.breakTheListCollection()
    await member.sync()

    backend.mendTheListCollection()
    await member.sync()

    expect(member.listIds()).toEqual([])
  })
})
