import { describe, expect, it } from 'vitest'
import { createSlice, type PayloadAction } from '@/app/createSlice'
import { composeSyncPolicy } from '@/app/sync/syncPolicy'

// Slices of their own, so the tests state the rules rather than leaning on
// whatever the feature slices happen to declare today.
const lists = createSlice({
  name: 'policyLists',
  initialState: {},
  synced: true,
  reducers: {
    opened: {
      role: 'event',
      opens: 'list',
      reducer: (
        state: object,
        _action: PayloadAction<{
          readonly listId: string
          readonly ownerId: string
        }>,
      ) => state,
    },
    renamed: {
      role: 'event',
      on: 'list',
      reducer: (
        state: object,
        _action: PayloadAction<{ readonly listId: string }>,
      ) => state,
    },
    dropped: { role: 'localEvent', reducer: (state: object) => state },
    observed: { role: 'observation', reducer: (state: object) => state },
    loaded: { role: 'hydration', reducer: (state: object) => state },
  },
})

const recipes = createSlice({
  name: 'policyRecipes',
  initialState: {},
  synced: true,
  reducers: {
    edited: {
      role: 'event',
      on: 'recipe',
      reducer: (
        state: object,
        _action: PayloadAction<{ readonly recipeId: string }>,
      ) => state,
    },
  },
})

const policy = composeSyncPolicy(lists.declarations, recipes.declarations)
const meta = { eventId: 'e1', deviceId: 'd1' }

describe('reachesServer', () => {
  it('lässt Events auf einem Log zum Server', () => {
    expect(
      policy.reachesServer({
        ...lists.actions.renamed({ listId: 'l1' }),
        meta,
      }),
    ).toBe(true)
  })

  it('lässt eröffnende Events zum Server', () => {
    expect(
      policy.reachesServer({
        ...lists.actions.opened({ listId: 'l1', ownerId: 'u1' }),
        meta,
      }),
    ).toBe(true)
  })

  it('behält localEvent, observation und hydration auf dem Gerät', () => {
    for (const creator of [
      lists.actions.dropped,
      lists.actions.observed,
      lists.actions.loaded,
    ]) {
      expect(
        policy.reachesServer({ type: creator.type, payload: {}, meta }),
      ).toBe(false)
    }
  })

  it('kennt undeklarierte Actions nicht', () => {
    expect(
      policy.reachesServer({
        type: 'preferences/themeChanged',
        payload: {},
        meta,
      }),
    ).toBe(false)
  })

  it('schickt Server-Echos nie zurück', () => {
    expect(
      policy.reachesServer({
        ...lists.actions.renamed({ listId: 'l1' }),
        meta: { ...meta, remote: true },
      }),
    ).toBe(false)
  })

  it('schickt Actions ohne meta nie', () => {
    expect(policy.reachesServer(lists.actions.renamed({ listId: 'l1' }))).toBe(
      false,
    )
  })
})

describe('toOutboxEntry', () => {
  it('routet ein Event auf ein Log an dessen Events-Pfad, Wire unverändert', () => {
    const action = { ...lists.actions.renamed({ listId: 'l1' }), meta }
    expect(policy.toOutboxEntry(action)).toEqual({
      path: '/lists/l1/events',
      wire: action,
    })
  })

  it('routet ein Recipe-Event an das Recipe-Log', () => {
    const action = { ...recipes.actions.edited({ recipeId: 'bolo' }), meta }
    expect(policy.toOutboxEntry(action)).toEqual({
      path: '/recipes/bolo/events',
      wire: action,
    })
  })

  it('routet ein eröffnendes Event an die Collection und nennt den Ersteller createdBy', () => {
    const action = {
      ...lists.actions.opened({ listId: 'l1', ownerId: 'u1' }),
      meta,
    }
    expect(policy.toOutboxEntry(action)).toEqual({
      path: '/lists',
      wire: {
        type: 'policyLists/opened',
        payload: { listId: 'l1', createdBy: 'u1' },
        meta,
      },
    })
  })

  it('gibt null für alles, was das Gerät nicht verlässt', () => {
    expect(
      policy.toOutboxEntry({
        type: lists.actions.dropped.type,
        payload: { listId: 'l1' },
        meta,
      }),
    ).toBeNull()
    expect(
      policy.toOutboxEntry({
        type: 'preferences/themeChanged',
        payload: { listId: 'l1' },
        meta,
      }),
    ).toBeNull()
    expect(
      policy.toOutboxEntry({
        ...lists.actions.renamed({ listId: 'l1' }),
        meta: { ...meta, remote: true },
      }),
    ).toBeNull()
  })
})

describe('domainActionOf', () => {
  it('übersetzt createdBy zurück zu ownerId für eröffnende Events', () => {
    const wire = {
      type: 'policyLists/opened',
      payload: { listId: 'l1', createdBy: 'u1' },
      meta,
    }
    expect(policy.domainActionOf(wire)).toEqual({
      type: 'policyLists/opened',
      payload: { listId: 'l1', ownerId: 'u1' },
      meta,
    })
  })

  it('lässt ein createdBy auf einem nicht eröffnenden Event stehen', () => {
    const wire = {
      type: 'policyLists/renamed',
      payload: { listId: 'l1', createdBy: 'u1' },
      meta,
    }
    expect(policy.domainActionOf(wire)).toBe(wire)
  })

  it('gibt eine Action ohne etwas zu übersetzen unverändert zurück', () => {
    const plain = { ...lists.actions.renamed({ listId: 'l1' }), meta }
    expect(policy.domainActionOf(plain)).toBe(plain)
  })
})

describe('composeSyncPolicy', () => {
  it('lehnt einen doppelt deklarierten Action-Typ ab', () => {
    expect(() =>
      composeSyncPolicy(lists.declarations, lists.declarations),
    ).toThrow(/policyLists\/opened/)
  })
})
