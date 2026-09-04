# Sync-Deklaration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Deklaration pro Reducer (`role` + `on`/`opens`) beantwortet, ob eine Action das Gerät verlässt und wohin sie geht — die Rolle `command`, der Payload-Scan `aggregateOf()`, die globale Rollen-Registry, die `.match()`-Sonderfälle in `toOutboxEntry.ts` und das Fake-`remote`-Muster in `memberCommands.ts` entfallen; `listLeft` wird zur ehrlichen lokalen Tatsache `listDropped`.

**Architecture:** `createSlice` erzwingt für `synced: true`-Slices eine `ActionDeclaration` pro Reducer und prüft zur Compile-Zeit, dass ein Event mit `on: 'list'`/`opens: 'list'` ein `listId`-Payload trägt; es gibt die Deklarationen als Wert zurück. `app/sync/appSyncPolicy.ts` komponiert daraus explizit **eine** `SyncPolicy` (`reachesServer`, `toOutboxEntry`, `domainPayloadOf`, `domainActionOf`), die `store.ts` an `withSync` und die `SyncEngine` im Konstruktor bekommt. `needsSync.ts`, `toOutboxEntry.ts`, `fromServer.ts` werden gelöscht.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Redux mit eigenem `createSlice` ohne Immer, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-sync-declaration-design.md`

## Global Constraints

- Alle Kommandos laufen im Verzeichnis `apps/mobile`.
- Kein neues `any` außer im bereits bestehenden Muster von `createSlice.ts` (dort ist `any` die vorhandene Inferenz-Technik). Kein `as` außer in Tests für partielle Fixtures.
- `const` statt `let`, `readonly` auf allen neuen Properties. Kommentare im Code auf Englisch.
- **Bestehende Tests dürfen angepasst werden — vom Nutzer freigegeben, aber nur die in den Tasks namentlich genannten Dateien.**
- Die Inferenz-Typen `InferPayload`, `RawActionCreator`, `RawActionCreatorFromFunction`, `RawActionCreatorFromPrepare`, `WithoutRole` bleiben unverändert (nur `ActionRole` verliert den Wert `'command'`).
- Wire-Format und Server bleiben unverändert. `lists/listCreated` geht weiterhin mit `createdBy` an `POST /lists`.
- **Erwartetes rotes `tsc`-Fenster:** nach Task 1 bis Ende Task 4. `pnpm test` bleibt nach **jedem** Task grün — Vitest typprüft nicht, und die Laufzeit der alten Registry bleibt bis Task 4 erhalten.
- Reihenfolge Task 1 → 2 → 3 → 4 → 5 → 6 → 7 ist bindend.

---

### Task 1: `createSlice.ts` — Deklarationen mit `on`/`opens`, Compile-Constraint, `declarations`-Rückgabe

**Files:**
- Modify: `apps/mobile/src/app/createSlice.ts`
- Modify: `apps/mobile/src/app/sync/aggregate.ts` (nur `idFieldOf` exportieren)
- Modify: `apps/mobile/test/app/createSlice.test.ts`
- Create: `apps/mobile/test/app/createSlice.types.ts`

**Interfaces:**
- Produces: `ActionRole = 'event' | 'localEvent' | 'observation' | 'hydration'`; `ActionDeclaration`; `SyncDeclarations = Readonly<Record<string, ActionDeclaration>>`; `createSlice(...)` gibt zusätzlich `declarations: SyncDeclarations` zurück; `idFieldOf(kind: AggregateKind): string` aus `aggregate.ts`.
- Übergangsweise bleiben `roleOf`, `belongsToSyncedSlice` und die globale Registry **zur Laufzeit** erhalten (Task 4 entfernt sie), damit `needsSync.ts` bis dahin funktioniert.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`apps/mobile/test/app/createSlice.test.ts` — den Block `describe('action role registry', …)` **ersetzen** durch (der Block `describe('synced slices', …)` bleibt bis Task 4 stehen):

```ts
describe('sync declarations', () => {
  it('gibt die Deklaration jedes synced Reducers unter seinem Action-Typ zurück', () => {
    const slice = createSlice({
      name: 'declaredDemo',
      initialState: {},
      synced: true,
      reducers: {
        thingRenamed: {
          role: 'event',
          on: 'list',
          reducer: (
            state: object,
            _action: PayloadAction<{ readonly listId: string }>,
          ) => state,
        },
        thingCreated: {
          role: 'event',
          opens: 'list',
          reducer: (
            state: object,
            _action: PayloadAction<{ readonly listId: string }>,
          ) => state,
        },
        thingDropped: { role: 'localEvent', reducer: (state: object) => state },
        thingsLoaded: { role: 'hydration', reducer: (state: object) => state },
      },
    })

    expect(slice.declarations).toEqual({
      'declaredDemo/thingRenamed': { role: 'event', on: 'list' },
      'declaredDemo/thingCreated': { role: 'event', opens: 'list' },
      'declaredDemo/thingDropped': { role: 'localEvent' },
      'declaredDemo/thingsLoaded': { role: 'hydration' },
    })
  })

  it('hat keine Deklarationen für einen unsynced Slice', () => {
    const slice = createSlice({
      name: 'undeclaredDemo',
      initialState: {},
      reducers: { somethingHappened: (state: object) => state },
    })

    expect(slice.declarations).toEqual({})
  })

  it('erzeugt für die Deklarationsform funktionierende Action Creators', () => {
    const slice = createSlice({
      name: 'creatorDemo',
      initialState: { seen: '' },
      synced: true,
      reducers: {
        thingRenamed: {
          role: 'event',
          on: 'list',
          reducer: (
            _state: { readonly seen: string },
            action: PayloadAction<{ readonly listId: string; readonly name: string }>,
          ) => ({ seen: action.payload.name }),
        },
      },
    })

    const action = slice.actions.thingRenamed({ listId: 'l1', name: 'Brot' })

    expect(action).toEqual({
      type: 'creatorDemo/thingRenamed',
      payload: { listId: 'l1', name: 'Brot' },
    })
    expect(slice.reducer({ seen: '' }, action)).toEqual({ seen: 'Brot' })
  })
})
```

Den Import am Dateikopf auf folgendes setzen (`roleOf` raus):

```ts
import {
  createSlice,
  belongsToSyncedSlice,
  type PayloadAction,
} from '@/app/createSlice'
```

Neue Datei `apps/mobile/test/app/createSlice.types.ts` (endet nicht auf `.test.ts` — Vitest ignoriert sie, `tsc` prüft sie, weil `tsconfig.json` `test` einschließt):

```ts
// Compile-time contract of createSlice declarations. Checked by
// `pnpm exec tsc --noEmit`, not by vitest: each @ts-expect-error below must
// suppress exactly one error, so a contract that stops holding fails tsc.

import { createSlice, type PayloadAction } from '@/app/createSlice'

type Demo = { readonly seen: string }
const initialState: Demo = { seen: '' }

// A well-declared slice compiles.
createSlice({
  name: 'typesOk',
  synced: true,
  initialState,
  reducers: {
    renamed: {
      role: 'event',
      on: 'list',
      reducer: (
        _state: Demo,
        action: PayloadAction<{ readonly listId: string; readonly name: string }>,
      ): Demo => ({ seen: action.payload.name }),
    },
    created: {
      role: 'event',
      opens: 'recipe',
      reducer: (
        _state: Demo,
        action: PayloadAction<{ readonly recipeId: string }>,
      ): Demo => ({ seen: action.payload.recipeId }),
    },
    dropped: { role: 'localEvent', reducer: (state: Demo): Demo => state },
  },
})

// An event on a list must take a payload that names the list.
createSlice({
  name: 'typesMissingId',
  synced: true,
  initialState,
  reducers: {
    // @ts-expect-error an event on 'list' must carry a string listId
    renamed: {
      role: 'event',
      on: 'list',
      reducer: (
        _state: Demo,
        action: PayloadAction<{ readonly name: string }>,
      ): Demo => ({ seen: action.payload.name }),
    },
  },
})

// An event must say which aggregate it is on or opens.
createSlice({
  name: 'typesNoAggregate',
  synced: true,
  initialState,
  reducers: {
    // @ts-expect-error role 'event' needs on or opens
    renamed: { role: 'event', reducer: (state: Demo): Demo => state },
  },
})

// A synced slice accepts no bare reducer.
createSlice({
  name: 'typesNoRole',
  synced: true,
  initialState,
  reducers: {
    // @ts-expect-error a synced reducer must declare its role
    renamed: (state: Demo): Demo => state,
  },
})
```

- [ ] **Step 2: Tests ausführen, Fehlschlag bestätigen**

Run: `pnpm vitest run test/app/createSlice.test.ts`
Expected: FAIL — `slice.declarations` ist `undefined`, und `on`/`opens` sind in den Typen unbekannt (zur Laufzeit egal, Vitest typprüft nicht).

- [ ] **Step 3: `createSlice.ts` umbauen**

**(a)** Import am Dateikopf ergänzen (type-only, deshalb kein Laufzeit-Zyklus — `aggregate.ts` importiert seinerseits nur den Typ `PayloadAction`):

```ts
import type { AggregateKind } from './sync/aggregate'
```

**(b)** Den Block `ActionRole` (Kommentar + Typ) ersetzen durch:

```ts
/**
 * How a synced slice classifies one of its actions
 * (design: docs/superpowers/specs/2026-09-04-sync-declaration-design.md).
 *
 * - event: a domain fact. `on` names the aggregate whose log it is
 *   appended to; `opens` names the kind of aggregate it brings into being —
 *   no log exists yet, so it goes to the collection endpoint, where the
 *   server bootstraps ownership. Both travel to the server.
 * - localEvent: a domain fact whose reach is deliberately this device only
 * - observation: a current value a query reported — no user action, no log entry
 * - hydration: restoring data this device already knew, from local storage
 */
export type ActionDeclaration =
  | { readonly role: 'event'; readonly on: AggregateKind }
  | { readonly role: 'event'; readonly opens: AggregateKind }
  | { readonly role: 'localEvent' }
  | { readonly role: 'observation' }
  | { readonly role: 'hydration' }

export type ActionRole = ActionDeclaration['role']

/** Every declaration of a synced slice, keyed by full action type (`lists/listRenamed`). */
export type SyncDeclarations = Readonly<Record<string, ActionDeclaration>>
```

**(c)** `ActionMeta.remote` Doc-Kommentar ersetzen:

```ts
  /** Set by the receive path for events folded from the server. They are never sent back. */
  readonly remote?: boolean
```

**(d)** `SyncedReducerDefinition<S>` ersetzen durch:

```ts
// A synced slice mixes categories — domain events, facts that stay local,
// query results — so the classification lives per reducer, not per slice.
// The declaration is mandatory there: the overload below accepts no bare
// function, and an event must say which aggregate it is on or opens.
type SyncedReducerDefinition<S> = ActionDeclaration &
  (
    | { readonly reducer: (state: S, action: PayloadAction<any>) => S }
    | {
        readonly prepare: (...args: any[]) => { readonly payload: any }
        readonly reducer: (state: S, action: PayloadAction<any>) => S
      }
  )
```

**(e)** Direkt nach `type InferPayload<R> = …` die Compile-Constraint einfügen:

```ts
// --- Event payloads must name their aggregate ---
//
// The route of an event is built from the id field of its aggregate. The
// compiler checks the field is there, so no event can ever be admitted for
// sending and then turn out unroutable.

/** Mirrors ID_FIELD_OF in sync/aggregate.ts — the two must agree. */
type AggregateIdField<K extends AggregateKind> = K extends 'list'
  ? 'listId'
  : K extends 'recipe'
    ? 'recipeId'
    : 'planId'

type AggregateOf<D> = D extends { readonly on: infer K extends AggregateKind }
  ? K
  : D extends { readonly opens: infer K extends AggregateKind }
    ? K
    : never

type NamesItsAggregate<D> = [AggregateOf<D>] extends [never]
  ? D
  : InferPayload<WithoutRole<D>> extends {
        readonly [F in AggregateIdField<AggregateOf<D>>]: string
      }
    ? D
    : {
        readonly reducer: `an event on/opens '${AggregateOf<D>}' must take a payload with a string ${AggregateIdField<AggregateOf<D>>}`
      }
```

**(f)** Den Overload für `synced: true` so ändern (nur die Constraint an `R` und der Rückgabetyp ändern sich; der Overload für `synced?: false` bekommt ebenfalls `declarations` im Rückgabetyp):

```ts
export function createSlice<
  Name extends string,
  S,
  R extends Record<string, ReducerDefinition<S>>,
>(config: {
  readonly name: Name
  readonly initialState: S
  readonly reducers: R
  readonly extraReducers?: readonly ExtraReducer<S>[]
  readonly synced?: false
}): {
  readonly actions: ActionCreators<Name, R>
  readonly reducer: (state: S | undefined, action: { readonly type: string }) => S
  readonly declarations: SyncDeclarations
}

export function createSlice<
  Name extends string,
  S,
  R extends Record<string, SyncedReducerDefinition<S>> & {
    readonly [K in keyof R]: NamesItsAggregate<R[K]>
  },
>(config: {
  readonly name: Name
  readonly initialState: S
  readonly reducers: R
  readonly extraReducers?: readonly ExtraReducer<S>[]
  readonly synced: true
}): {
  readonly actions: ActionCreators<Name, R>
  readonly reducer: (state: S | undefined, action: { readonly type: string }) => S
  readonly declarations: SyncDeclarations
}
```

**(g)** Die Implementierung: Rückgabetyp um `readonly declarations: SyncDeclarations` ergänzen, in der Schleife die Deklaration einsammeln, am Ende zurückgeben. Der Rumpf sieht danach so aus (die Registry-Zeile `roleByActionType.set(...)` bleibt bis Task 4 stehen):

```ts
export function createSlice(config: {
  readonly name: string
  readonly initialState: any
  readonly reducers: Record<string, any>
  readonly extraReducers?: readonly ExtraReducer<any>[]
  readonly synced?: boolean
}): {
  readonly actions: Record<string, any>
  readonly reducer: (state: any, action: { readonly type: string }) => any
  readonly declarations: SyncDeclarations
} {
  if (config.synced) syncedSliceNames.add(config.name)

  const actionCreators = {} as Record<string, (...args: unknown[]) => unknown>
  const lookup: Record<string, (state: any, action: any) => any> = {}
  const declarations: Record<string, ActionDeclaration> = {}

  for (const key of Object.keys(config.reducers)) {
    const type = `${config.name}/${key}`
    const definition = config.reducers[key] as
      | ((state: any, action: any) => any)
      | (ActionDeclaration & {
          readonly prepare?: (...args: unknown[]) => { readonly payload: unknown }
          readonly reducer: (state: any, action: any) => any
        })

    if (typeof definition === 'function') {
      const creator = (payload?: unknown) =>
        payload !== undefined ? { type, payload } : { type }
      creator.type = type
      creator.match = (action: { readonly type: string }): boolean =>
        action.type === type
      actionCreators[key] = creator
      lookup[type] = definition
      continue
    }

    const { prepare, reducer: caseReducer, ...declaration } = definition
    if (prepare) {
      const creator = (...args: unknown[]) => ({ type, ...prepare(...args) })
      creator.type = type
      creator.match = (action: { readonly type: string }): boolean =>
        action.type === type
      actionCreators[key] = creator
    } else {
      const creator = (payload?: unknown) =>
        payload !== undefined ? { type, payload } : { type }
      creator.type = type
      creator.match = (action: { readonly type: string }): boolean =>
        action.type === type
      actionCreators[key] = creator
    }
    lookup[type] = caseReducer

    if (config.synced) {
      declarations[type] = declaration
      roleByActionType.set(type, declaration.role)
    }
  }

  for (const external of config.extraReducers ?? []) {
    lookup[external.creator.type] = external.reducer
  }

  const reducer = (state: any, action: { readonly type: string }): any => {
    if (state === undefined) return config.initialState
    const caseReducer = lookup[action.type]
    return caseReducer ? caseReducer(state, action) : state
  }

  return {
    actions: actionCreators,
    reducer,
    declarations,
  }
}
```

**(h)** In `apps/mobile/src/app/sync/aggregate.ts` direkt nach `const ID_FIELD_OF = …` ergänzen:

```ts
/** The payload field that names an aggregate of this kind. Called by the sync policy to route an event. */
export function idFieldOf(kind: AggregateKind): string {
  return ID_FIELD_OF[kind]
}
```

- [ ] **Step 4: Tests ausführen, Erfolg bestätigen**

Run: `pnpm vitest run test/app/createSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Volle Suite und Typprüfung**

Run: `pnpm test`
Expected: alle grün (die Slices deklarieren noch `command`/kein `on` — zur Laufzeit egal).

Run: `pnpm exec tsc --noEmit`
Expected: **erwartete Fehler nur in** `listsSlice.ts`, `shoppingSlice.ts`, `recipesSlice.ts` (kein `on`/`opens`, `'command'` unbekannt), `needsSync.ts` (`REACHES_SERVER` hat den Key `command`), `needsSync.test.ts` und `toOutboxEntry.test.ts` (`role: 'command'`, `role: 'event'` ohne `on`). **Keine Fehler in `createSlice.types.ts`** — steht dort ein Fehler „Unused '@ts-expect-error' directive", greift die Constraint nicht; steht ein Fehler auf einer anderen Zeile als der markierten, den Kommentar auf die von `tsc` genannte Zeile verschieben (die Zusicherung ist „genau ein Fehler pro Fall", nicht die Zeile). Falls Fehler in anderen Dateien auftauchen, ist die Inferenz beschädigt — vor dem Commit beheben.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/createSlice.ts apps/mobile/src/app/sync/aggregate.ts apps/mobile/test/app/createSlice.test.ts apps/mobile/test/app/createSlice.types.ts
git commit -m "feat(sync): declare on/opens per event, return the declarations, drop the command role"
```

---

### Task 2: Die drei Slices deklarieren `on`/`opens` und exportieren ihre Deklarationen

**Files:**
- Modify: `apps/mobile/src/features/lists/domain/listsSlice.ts`
- Modify: `apps/mobile/src/features/shopping/domain/shoppingSlice.ts`
- Modify: `apps/mobile/src/features/recipes/domain/recipesSlice.ts`

**Interfaces:**
- Consumes: `ActionDeclaration`-Form aus Task 1.
- Produces: `export const listsSyncDeclarations`, `shoppingSyncDeclarations`, `recipesSyncDeclarations` (jeweils `SyncDeclarations`). Action-Namen und Payloads unverändert.

- [ ] **Step 1: `listsSlice.ts`**

Reducer-Rümpfe bleiben wortgleich. Deklarationen ändern:

| Reducer | vorher | nachher |
|---|---|---|
| `listsLoaded` | `role: 'hydration'` | unverändert |
| `listCreated` | `role: 'command'` | `role: 'event', opens: 'list'` |
| `listRenamed` | `role: 'event'` | `role: 'event', on: 'list'` |
| `listLeft` | `role: 'localEvent'` | unverändert |
| `listRestored` | `role: 'localEvent'` | unverändert |
| `listDeleted` | `role: 'event'` | `role: 'event', on: 'list'` |
| `listMemberAdded` | `role: 'event'` | `role: 'event', on: 'list'` |
| `listMemberRemoved` | `role: 'event'` | `role: 'event', on: 'list'` |
| `memberLimitLoaded` | `role: 'observation'` | unverändert |
| `ownerNamesLoaded` | `role: 'observation'` | unverändert |

Über `listCreated` diesen Kommentar einfügen:

```ts
    // Opens the list's log: no membership exists yet, so it goes to the
    // collection endpoint, where the server bootstraps ownership for the
    // caller and appends this very event (services/events.md).
```

Nach `export const listsReducer = listsSlice.reducer` ergänzen:

```ts
export const listsSyncDeclarations = listsSlice.declarations
```

- [ ] **Step 2: `shoppingSlice.ts`**

`shoppingLoaded` bleibt `role: 'hydration'`. Die sieben Events `itemAdded`, `itemChecked`, `itemUnchecked`, `itemRemoved`, `itemUpdated`, `itemNoteUpdated`, `customVariantAdded` bekommen `role: 'event', on: 'list'` — sie liegen auf dem Listen-Log, obwohl der shopping-Slice sie dispatcht (sync-engine.md §3). Nach `export const shoppingReducer = …`:

```ts
export const shoppingSyncDeclarations = shoppingSlice.declarations
```

- [ ] **Step 3: `recipesSlice.ts`**

| Reducer | nachher |
|---|---|
| `recipesLoaded` | `role: 'hydration'` (unverändert) |
| `recipeCreated` | `role: 'event', opens: 'recipe'` |
| `recipeUpdated` | `role: 'event', on: 'recipe'` |
| `recipeLeft` | `role: 'localEvent'` (unverändert) |
| `recipeDeleted` | `role: 'event', on: 'recipe'` |
| `recipeMemberAdded` | `role: 'event', on: 'recipe'` |
| `recipeMemberRemoved` | `role: 'event', on: 'recipe'` |
| `recipeOwnerNamesLoaded` | `role: 'observation'` (unverändert) |

Über `recipeCreated` diesen Kommentar einfügen:

```ts
    // Opens the recipe's log: no membership exists yet, so it goes to the
    // collection endpoint, where the server bootstraps ownership for the
    // caller and appends this very event (services/events.md).
```

Nach `export const recipesReducer = …`:

```ts
export const recipesSyncDeclarations = recipesSlice.declarations
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `pnpm test`
Expected: alle grün.

Run: `pnpm exec tsc --noEmit`
Expected: Fehler **nur noch** in `needsSync.ts`, `test/app/sync/needsSync.test.ts`, `test/app/sync/send/toOutboxEntry.test.ts` (alle wegen `'command'` bzw. `role: 'event'` ohne `on`). Meldet `tsc` einen Fehler in einem Slice, fehlt dort ein `on`/`opens` oder das Payload trägt das Aggregate-Feld nicht — beides beheben, nichts umbenennen.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/lists/domain/listsSlice.ts apps/mobile/src/features/shopping/domain/shoppingSlice.ts apps/mobile/src/features/recipes/domain/recipesSlice.ts
git commit -m "refactor(sync): events declare the aggregate they are on or open"
```

---

### Task 3: `syncPolicy.ts` und `appSyncPolicy.ts` — additiv, noch nicht verdrahtet

**Files:**
- Create: `apps/mobile/src/app/sync/syncPolicy.ts`
- Create: `apps/mobile/src/app/sync/appSyncPolicy.ts`
- Create: `apps/mobile/test/app/sync/syncPolicy.test.ts`

**Interfaces:**
- Consumes: `SyncDeclarations`, `ActionDeclaration`, `ActionRole`, `PayloadAction` (createSlice); `idFieldOf`, `eventsPathFor`, `collectionPathFor` (aggregate.ts); `ownerIdToCreatedBy`, `createdByToOwnerId` (wire.ts); `OutboxEntry` (outbox.ts).
- Produces:

```ts
export type SyncPolicy = {
  readonly reachesServer: (action: PayloadAction<unknown>) => boolean
  readonly toOutboxEntry: (action: PayloadAction<unknown>) => OutboxEntry | null
  readonly domainPayloadOf: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>
  readonly domainActionOf: (wire: PayloadAction<unknown>) => PayloadAction<unknown>
}
export function composeSyncPolicy(...declarationSets: readonly SyncDeclarations[]): SyncPolicy
export const appSyncPolicy: SyncPolicy   // appSyncPolicy.ts
```

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`apps/mobile/test/app/sync/syncPolicy.test.ts`:

```ts
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
        _action: PayloadAction<{ readonly listId: string; readonly ownerId: string }>,
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
      policy.reachesServer({ ...lists.actions.renamed({ listId: 'l1' }), meta }),
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
    for (const creator of [lists.actions.dropped, lists.actions.observed, lists.actions.loaded]) {
      expect(policy.reachesServer({ type: creator.type, payload: {}, meta })).toBe(false)
    }
  })

  it('kennt undeklarierte Actions nicht', () => {
    expect(
      policy.reachesServer({ type: 'preferences/themeChanged', payload: {}, meta }),
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
    expect(policy.reachesServer(lists.actions.renamed({ listId: 'l1' }))).toBe(false)
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
    const action = { ...lists.actions.opened({ listId: 'l1', ownerId: 'u1' }), meta }
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
      policy.toOutboxEntry({ type: lists.actions.dropped.type, payload: { listId: 'l1' }, meta }),
    ).toBeNull()
    expect(
      policy.toOutboxEntry({ type: 'preferences/themeChanged', payload: { listId: 'l1' }, meta }),
    ).toBeNull()
    expect(
      policy.toOutboxEntry({
        ...lists.actions.renamed({ listId: 'l1' }),
        meta: { ...meta, remote: true },
      }),
    ).toBeNull()
  })
})

describe('wire translation', () => {
  it('übersetzt createdBy zurück zu ownerId nur für eröffnende Events', () => {
    expect(
      policy.domainPayloadOf('policyLists/opened', { listId: 'l1', createdBy: 'u1' }),
    ).toEqual({ listId: 'l1', ownerId: 'u1' })
    expect(
      policy.domainPayloadOf('policyLists/renamed', { listId: 'l1', createdBy: 'u1' }),
    ).toEqual({ listId: 'l1', createdBy: 'u1' })
  })

  it('übersetzt eine gequeuete Wire-Action zurück in Domain-Form', () => {
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
    const plain = { ...lists.actions.renamed({ listId: 'l1' }), meta }
    expect(policy.domainActionOf(plain)).toBe(plain)
  })
})

describe('composeSyncPolicy', () => {
  it('lehnt einen doppelt deklarierten Action-Typ ab', () => {
    expect(() => composeSyncPolicy(lists.declarations, lists.declarations)).toThrow(
      /policyLists\/opened/,
    )
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `pnpm vitest run test/app/sync/syncPolicy.test.ts`
Expected: FAIL — Modul `@/app/sync/syncPolicy` existiert nicht.

- [ ] **Step 3: `syncPolicy.ts` schreiben**

```ts
// The one place that knows what an action means to sync: whether it leaves
// the device (its role) and where it goes (the aggregate it is on or opens).
// Composed once from the declarations of every synced slice; withSync, the
// engine and the receive path only consume it
// (design: docs/superpowers/specs/2026-09-04-sync-declaration-design.md).

import type {
  ActionDeclaration,
  ActionRole,
  PayloadAction,
  SyncDeclarations,
} from '../createSlice'
import { collectionPathFor, eventsPathFor, idFieldOf } from './aggregate'
import type { OutboxEntry } from './outbox'
import { createdByToOwnerId, ownerIdToCreatedBy } from './wire'

export type SyncPolicy = {
  /** True for own domain events — they wait in pending. Called by withSync on every dispatch. */
  readonly reachesServer: (action: PayloadAction<unknown>) => boolean
  /** The queued send for an action, or null when it stays on the device. Called by SyncEngine.record. */
  readonly toOutboxEntry: (action: PayloadAction<unknown>) => OutboxEntry | null
  /** Wire → domain for one fetched payload (createdBy → ownerId on opening events). Called by catch-up. */
  readonly domainPayloadOf: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>
  /** Wire → domain for a whole queued action. Called once at engine start for pendingRestored. */
  readonly domainActionOf: (wire: PayloadAction<unknown>) => PayloadAction<unknown>
}

/**
 * Which roles travel to the server. A table rather than a condition: the
 * three roles that stay local say so out loud, and a new role cannot be
 * added without deciding this here — the type demands the entry.
 */
const REACHES_SERVER: Readonly<Record<ActionRole, boolean>> = {
  event: true,
  localEvent: false,
  observation: false,
  hydration: false,
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function opensAggregate(declaration: ActionDeclaration): boolean {
  return 'opens' in declaration
}

function routeOf(
  declaration: ActionDeclaration,
  action: PayloadAction<unknown>,
): OutboxEntry | null {
  if (!isRecord(action.payload)) return null
  if ('opens' in declaration) {
    return {
      path: collectionPathFor(declaration.opens),
      wire: { ...action, payload: ownerIdToCreatedBy(action.payload) },
    }
  }
  if ('on' in declaration) {
    // The compiler already made the field mandatory; this only narrows unknown.
    const id = action.payload[idFieldOf(declaration.on)]
    if (typeof id !== 'string') return null
    return { path: eventsPathFor({ kind: declaration.on, id }), wire: action }
  }
  return null
}

/** Builds the app's policy from the declarations of its synced slices. Called once, in appSyncPolicy.ts. */
export function composeSyncPolicy(
  ...declarationSets: readonly SyncDeclarations[]
): SyncPolicy {
  const declarations = new Map<string, ActionDeclaration>()
  for (const set of declarationSets) {
    for (const [type, declaration] of Object.entries(set)) {
      if (declarations.has(type)) {
        throw new Error(`sync: ${type} is declared by more than one slice`)
      }
      declarations.set(type, declaration)
    }
  }

  const reachesServer = (action: PayloadAction<unknown>): boolean => {
    if (!action.meta || action.meta.remote) return false
    const declaration = declarations.get(action.type)
    return declaration !== undefined && REACHES_SERVER[declaration.role]
  }

  const domainPayloadOf = (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> => {
    const declaration = declarations.get(type)
    return declaration && opensAggregate(declaration)
      ? createdByToOwnerId(payload)
      : { ...payload }
  }

  return {
    reachesServer,
    toOutboxEntry: (action) => {
      if (!reachesServer(action)) return null
      const declaration = declarations.get(action.type)
      return declaration ? routeOf(declaration, action) : null
    },
    domainPayloadOf,
    domainActionOf: (wire) => {
      const declaration = declarations.get(wire.type)
      if (!declaration || !opensAggregate(declaration) || !isRecord(wire.payload)) {
        return wire
      }
      return { ...wire, payload: createdByToOwnerId(wire.payload) }
    },
  }
}
```

- [ ] **Step 4: `appSyncPolicy.ts` schreiben**

```ts
// The policy of this app: every synced slice hands in its declarations
// here, once, by name. Nothing else registers anything anywhere.

import { composeSyncPolicy } from './syncPolicy'
import { listsSyncDeclarations } from '../../features/lists/domain/listsSlice'
import { shoppingSyncDeclarations } from '../../features/shopping/domain/shoppingSlice'
import { recipesSyncDeclarations } from '../../features/recipes/domain/recipesSlice'

export const appSyncPolicy = composeSyncPolicy(
  listsSyncDeclarations,
  shoppingSyncDeclarations,
  recipesSyncDeclarations,
)
```

- [ ] **Step 5: Tests ausführen, Erfolg bestätigen**

Run: `pnpm vitest run test/app/sync/syncPolicy.test.ts`
Expected: PASS — alle 13 Tests.

Run: `pnpm test`
Expected: alle grün.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/sync/syncPolicy.ts apps/mobile/src/app/sync/appSyncPolicy.ts apps/mobile/test/app/sync/syncPolicy.test.ts
git commit -m "feat(sync): compose one SyncPolicy from the slices' declarations"
```

---

### Task 4: Policy verdrahten, alte Klassifikation entfernen

Dieser Task ist bewusst atomar: Umschalten und Löschen müssen zusammen passieren, sonst gibt es zwei Wahrheiten für dieselbe Frage.

**Files:**
- Modify: `apps/mobile/src/app/store.ts`
- Modify: `apps/mobile/src/app/sync/syncEngine.ts`
- Modify: `apps/mobile/src/app/sync/receive/catchUp.ts`
- Modify: `apps/mobile/src/app/sync/receive/toLocalAction.ts`
- Modify: `apps/mobile/src/app/sync/wire.ts`
- Modify: `apps/mobile/src/app/sync/aggregate.ts` (`aggregateOf` löschen)
- Modify: `apps/mobile/src/app/createSlice.ts` (Registry, `roleOf`, `belongsToSyncedSlice`, `syncedSliceNames` löschen)
- Delete: `apps/mobile/src/app/sync/needsSync.ts`, `apps/mobile/src/app/sync/send/toOutboxEntry.ts`
- Delete: `apps/mobile/test/app/sync/needsSync.test.ts`, `apps/mobile/test/app/sync/send/toOutboxEntry.test.ts`
- Modify (Tests): `test/app/createSlice.test.ts`, `test/app/sync/syncEngine.test.ts`, `test/app/sync/syncEngine.stop.test.ts`, `test/app/sync/syncEngine.cycle.test.ts`, `test/app/sync/syncEngine.reconcile.test.ts`, `test/app/sync/receive/catchUp.test.ts`, `test/app/sync/receive/toLocalAction.test.ts`, `test/features/lists/domain/listsSlice.listLeft.test.ts`, `test/features/sharing/addMemberLocally.test.ts`, `test/features/sharing/removeMemberLocally.test.ts`

**Interfaces:**
- Consumes: `SyncPolicy`, `appSyncPolicy` (Task 3).
- Produces: `new SyncEngine(storage, transport, policy)`; `CatchUpDeps.domainPayloadOf`; `toLocalAction(event, domainPayloadOf)`.

- [ ] **Step 1: `store.ts`**

Import `needsSync` ersetzen:

```ts
import { appSyncPolicy } from './sync/appSyncPolicy'
```

und

```ts
const syncedReducer = withSync<FeatureState>(featureReducer, appSyncPolicy.reachesServer)
```

- [ ] **Step 2: `syncEngine.ts`**

Imports: `toOutboxEntry` und `domainActionOf` entfernen, ergänzen:

```ts
import { appSyncPolicy } from './appSyncPolicy'
import type { SyncPolicy } from './syncPolicy'
```

Konstruktor:

```ts
  constructor(
    private readonly storage: SyncStorage,
    private readonly transport: Transport,
    private readonly policy: SyncPolicy,
  ) {}
```

`record`:

```ts
  record(action: PayloadAction<unknown>): void {
    const entry = this.policy.toOutboxEntry(action)
```

In `openLocalLog`:

```ts
        outbox.queuedEntries().map((entry) => this.policy.domainActionOf(entry.wire)),
```

In `syncOnce`, beim `catchUp({ … })`-Aufruf das Deps-Objekt um eine Zeile ergänzen:

```ts
      fetchEventsSince: this.transport.fetchEventsSince,
      domainPayloadOf: this.policy.domainPayloadOf,
```

Singleton am Dateiende:

```ts
export const syncEngine = new SyncEngine({ getItem, setItem }, httpTransport, appSyncPolicy)
```

- [ ] **Step 3: `catchUp.ts` und `toLocalAction.ts`**

`CatchUpDeps` ergänzen:

```ts
  readonly domainPayloadOf: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>
```

`toConfirmedEvent` nimmt die Deps mit:

```ts
function toConfirmedEvent(deps: CatchUpDeps, event: WireEvent): ConfirmedEvent {
  const local = toLocalAction(event, deps.domainPayloadOf)
  return {
    type: local.type,
    payload: local.payload,
    meta: { ...event.meta, remote: true },
  }
}
```

und in `foldIntoConfirmedTree`: `incoming.map((event) => toConfirmedEvent(deps, event))`.

`toLocalAction.ts` komplett:

```ts
// Policy edge of the receive path: turns a server event back into a
// local action.

import type { PayloadAction } from '../../createSlice'
import type { WireEvent } from './fetchEvents'

/**
 * Called by catch-up for every fetched event. meta.remote stops the echo:
 * the policy won't send it again, eventIdMiddleware keeps its identity.
 * The payload translation comes from the sync policy (createdBy → ownerId
 * on opening events).
 */
export function toLocalAction(
  event: WireEvent,
  domainPayloadOf: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>,
): PayloadAction<unknown> {
  return {
    type: event.type,
    payload: domainPayloadOf(event.type, event.payload),
    meta: { ...event.meta, remote: true },
  }
}
```

- [ ] **Step 4: `wire.ts` auf die zwei Umbenennungen reduzieren**

Kompletter Inhalt:

```ts
// Opening events cross the wire with `createdBy` where the domain says
// `ownerId` (services/events.md). Both directions live here as a pair —
// whoever changes one sees the other. Which events that applies to is the
// sync policy's knowledge (`opens` in the slice declaration), not this file's.

/** Domain → wire. Called by the sync policy when queueing an opening event. */
export function ownerIdToCreatedBy(
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { ownerId, ...rest } = payload
  return { ...rest, createdBy: ownerId }
}

/** Wire → domain. Called by the sync policy when folding a fetched opening event. */
export function createdByToOwnerId(
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { createdBy, ...rest } = payload
  return { ...rest, ownerId: createdBy }
}
```

- [ ] **Step 5: `aggregate.ts` — `aggregateOf` löschen**

Die Funktion `aggregateOf` samt Doc-Kommentar entfernen. `ALL_KINDS` bleibt (wird von `isAggregateKind` genutzt). Den Kopfkommentar der Datei unverändert lassen.

- [ ] **Step 6: `createSlice.ts` — Registry entfernen**

Löschen: den Block `// --- Sync Policy ---` mit `syncedSliceNames` und `belongsToSyncedSlice`, den Block `// --- Action role registry ---` mit `roleByActionType` und `roleOf`, in der Implementierung die Zeilen `if (config.synced) syncedSliceNames.add(config.name)` und `roleByActionType.set(type, declaration.role)`. Der verbleibende Zweig lautet:

```ts
    if (config.synced) declarations[type] = declaration
```

Den langen Kommentar über den Overloads (beginnt mit `// This overload (synced?: false) is declared first. Verified experimentally …`) ersetzen durch:

```ts
// Two overloads: a synced slice must declare every reducer (and every
// event's aggregate), an unsynced one takes bare reducers. When a call
// fails both, TypeScript's overload recovery widens the inferred action
// creators — the error shows at the slice, but importing files may report
// follow-up errors until it is fixed.
```

- [ ] **Step 7: Alte Dateien löschen**

```bash
git rm apps/mobile/src/app/sync/needsSync.ts apps/mobile/src/app/sync/send/toOutboxEntry.ts apps/mobile/test/app/sync/needsSync.test.ts apps/mobile/test/app/sync/send/toOutboxEntry.test.ts
```

- [ ] **Step 8: Tests anpassen**

`test/app/createSlice.test.ts`: den Block `describe('synced slices', …)` und den Import `belongsToSyncedSlice` löschen. Import wird zu:

```ts
import { createSlice, type PayloadAction } from '@/app/createSlice'
```

`test/app/sync/syncEngine.test.ts`, `syncEngine.stop.test.ts`, `syncEngine.cycle.test.ts`, `syncEngine.reconcile.test.ts`: den Side-Effect-Import `import '@/features/shopping/domain/shoppingSlice'` (falls vorhanden, samt Kommentar) ersetzen durch

```ts
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'
```

und **jedes** `new SyncEngine(memoryStorage(), <transport>)` um das dritte Argument `appSyncPolicy` ergänzen — z.B. `new SyncEngine(memoryStorage(), recordingTransport(sent), appSyncPolicy)`. In `syncEngine.reconcile.test.ts` sind die Konstruktoraufrufe mehrzeilig; das Argument als letzte Zeile anfügen.

`test/app/sync/receive/catchUp.test.ts`: in jedem der vier `catchUp({ … })`-Deps-Objekte die Zeile ergänzen:

```ts
      domainPayloadOf: (_type, payload) => ({ ...payload }),
```

`test/app/sync/receive/toLocalAction.test.ts`: den Side-Effect-Import (samt Kommentar) ersetzen durch `import { appSyncPolicy } from '@/app/sync/appSyncPolicy'` und jeden Aufruf `toLocalAction(event)` durch `toLocalAction(event, appSyncPolicy.domainPayloadOf)`.

`test/features/lists/domain/listsSlice.listLeft.test.ts`, `test/features/sharing/addMemberLocally.test.ts`, `test/features/sharing/removeMemberLocally.test.ts`: den Import `import { needsSync } from '@/app/sync/needsSync'` ersetzen durch `import { appSyncPolicy } from '@/app/sync/appSyncPolicy'` und jeden Aufruf `needsSync(` durch `appSyncPolicy.reachesServer(`.

- [ ] **Step 9: Volle Suite und Typprüfung**

Run: `pnpm test`
Expected: alle grün.

Run: `pnpm exec tsc --noEmit`
Expected: **keine Fehler** — das rote Fenster ist geschlossen.

Run: `grep -rn "needsSync\|toOutboxEntry\b\|aggregateOf\|roleOf\|belongsToSyncedSlice" src test --include='*.ts' --include='*.tsx' | grep -v "policy.toOutboxEntry\|toOutboxEntry:"`
Expected: keine Treffer außer Kommentaren in `syncPolicy.ts` selbst.

- [ ] **Step 10: Commit**

```bash
git add -A apps/mobile/src/app apps/mobile/test/app apps/mobile/test/features/lists/domain/listsSlice.listLeft.test.ts apps/mobile/test/features/sharing/addMemberLocally.test.ts apps/mobile/test/features/sharing/removeMemberLocally.test.ts
git status
git commit -m "refactor(sync): route and classify from one composed policy, drop the registry and the payload scan"
```

(`git status` vor dem Commit: es dürfen nur die oben genannten Dateien gestaged sein.)

---

### Task 5: `listLeft` → `listDropped`, `recipeLeft` → `recipeDropped`

**Files:**
- Modify: `apps/mobile/src/features/lists/domain/listsSlice.ts`
- Modify: `apps/mobile/src/features/recipes/domain/recipesSlice.ts`
- Modify: `apps/mobile/src/features/lists/domain/leaveList.ts`
- Modify: `apps/mobile/src/app/sync/startSync.ts`
- Modify: `apps/mobile/src/features/preferences/domain/preferencesSlice.ts`
- Modify: `apps/mobile/src/features/shopping/domain/shoppingSlice.ts`
- Modify: `apps/mobile/src/features/lists/domain/listsClientStorageHandler.ts`
- Modify: `apps/mobile/src/features/shopping/domain/shoppingClientStorageHandler.ts`
- Modify: `apps/mobile/src/features/recipes/domain/recipesClientStorageHandler.ts`
- Rename+Modify: `apps/mobile/test/features/lists/domain/listsSlice.listLeft.test.ts` → `listsSlice.listDropped.test.ts`

**Interfaces:**
- Produces: `listDropped({ listId })`, `recipeDropped({ recipeId })` — Payloads unverändert, nur der Name.

- [ ] **Step 1: Test umbenennen und anpassen**

```bash
git mv apps/mobile/test/features/lists/domain/listsSlice.listLeft.test.ts apps/mobile/test/features/lists/domain/listsSlice.listDropped.test.ts
```

Darin: jedes `listLeft` → `listDropped` (Import und alle Aufrufe), `describe('leaving a list', …)` → `describe('dropping a list', …)`, und den Kommentar über `'never reaches the outbox'` ersetzen durch:

```ts
  // Whatever ended my membership also ended my access to the log, so the
  // server can never tell me about it — role: 'localEvent' keeps it here.
```

Run: `pnpm vitest run test/features/lists/domain/listsSlice.listDropped.test.ts`
Expected: FAIL — `listDropped` ist kein Export.

- [ ] **Step 2: Slices umbenennen**

`listsSlice.ts`: Reducer-Key `listLeft` → `listDropped`, im `export const { … }` ebenso. Den Doc-Kommentar darüber ersetzen:

```ts
    /**
     * Local-only: this device no longer holds the list — I left it, its
     * owner removed me, or it was deleted while I was away. The server's
     * own event about that never reaches me: whatever ended my membership
     * also ended my access to the log.
     */
```

Im Kommentar über `listRestored` `listLeft` → `listDropped`.

`recipesSlice.ts`: Reducer-Key `recipeLeft` → `recipeDropped`, Export ebenso, Kommentar:

```ts
    /**
     * Local-only: this device no longer holds the recipe — left, removed
     * by its owner, or deleted while I was away.
     */
```

- [ ] **Step 3: Konsumenten mitziehen**

`leaveList.ts`: Import und Aufruf `listLeft` → `listDropped`.

`startSync.ts`: Imports `listLeft` → `listDropped`, `recipeLeft` → `recipeDropped`; in `dropped()`:

```ts
function dropped(aggregate: Aggregate) {
  return aggregate.kind === 'recipe'
    ? recipeDropped({ recipeId: aggregate.id })
    : listDropped({ listId: aggregate.id })
}
```

`preferencesSlice.ts` und `shoppingSlice.ts`: Import und `creator: listLeft` → `creator: listDropped`; den Kommentar darüber jeweils auf `// A dropped list is gone from this device — its …` anpassen (Rest des Satzes behalten).

`listsClientStorageHandler.ts`: Import und `!listLeft.match(action)` → `!listDropped.match(action)`; im Kommentar „leaving drops a list" → „dropping removes a list". `shoppingClientStorageHandler.ts` und `recipesClientStorageHandler.ts` analog (`recipeLeft` → `recipeDropped`).

- [ ] **Step 4: Suite, Typprüfung, Restsuche**

Run: `pnpm test` — Expected: alle grün.
Run: `pnpm exec tsc --noEmit` — Expected: keine Fehler.
Run: `grep -rn "listLeft\|recipeLeft" src test` — Expected: keine Treffer.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile/src apps/mobile/test/features/lists/domain
git commit -m "refactor(lists): listDropped names the one local fact leaving and removal share"
```

---

### Task 6: Der Freundes-Tap bekommt ehrliche lokale Tatsachen; `fromServer.ts` entfällt

**Files:**
- Modify: `apps/mobile/src/features/lists/domain/listsSlice.ts`
- Modify: `apps/mobile/src/features/recipes/domain/recipesSlice.ts`
- Modify: `apps/mobile/src/features/sharing/memberCommands.ts`
- Delete: `apps/mobile/src/app/fromServer.ts`
- Modify (Tests): `test/features/sharing/addMemberLocally.test.ts`, `test/features/sharing/removeMemberLocally.test.ts`

**Interfaces:**
- Produces: `listMemberAddedLocally({ listId, memberId, name })`, `listMemberRemovedLocally({ listId, memberId })`, `recipeMemberAddedLocally({ recipeId, memberId, name })`, `recipeMemberRemovedLocally({ recipeId, memberId })` — alle `role: 'localEvent'`. `memberAddedLocally`/`memberRemovedLocally` in `memberCommands.ts` behalten Signatur, geben diese Actions zurück.

- [ ] **Step 1: Tests anpassen (schlagen dann fehl)**

`addMemberLocally.test.ts`: den Test `'is never sent to the server'` ersetzen durch

```ts
  // A local fact, not a server echo: it needs no fake origin to stay here.
  test('is never sent to the server', () => {
    expect(
      appSyncPolicy.reachesServer({
        ...memberAddedLocally({ kind: 'list', id: 'l1' }, 'sarah', 'Eiszebra'),
        meta: { eventId: 'e1', deviceId: 'd1' },
      }),
    ).toBe(false)
  })
```

und im Test `'speaks the recipe event for a recipe'` den erwarteten Typ auf `'recipes/recipeMemberAddedLocally'`.

`removeMemberLocally.test.ts`: analog — `meta: { eventId: 'e1', deviceId: 'd1' }` ohne `remote`, erwarteter Typ `'recipes/recipeMemberRemovedLocally'`, Kommentar über dem Sync-Test:

```ts
  // A local fact — the server already wrote the real event, this one only
  // makes the row disappear now instead of one pull later.
```

Run: `pnpm vitest run test/features/sharing`
Expected: FAIL — `reachesServer` ist `true` (heute geht `listMemberAdded` ohne `remote` raus) bzw. der Typ stimmt nicht.

- [ ] **Step 2: Reducer-Kerne teilen und lokale Actions ergänzen — `listsSlice.ts`**

Über `const listsSlice = createSlice({` zwei pure Funktionen einfügen:

```ts
function withMember(
  state: ListsState,
  listId: string,
  memberId: string,
  name: string,
): ListsState {
  return {
    ...state,
    lists: state.lists.map((list) =>
      list.id === listId
        ? {
            ...list,
            memberIds: list.memberIds.includes(memberId)
              ? list.memberIds
              : [...list.memberIds, memberId],
            memberNames: { ...list.memberNames, [memberId]: name },
          }
        : list,
    ),
  }
}

function withoutMember(
  state: ListsState,
  listId: string,
  memberId: string,
): ListsState {
  return {
    ...state,
    lists: state.lists.map((list) => {
      if (list.id !== listId) return list
      const { [memberId]: _removed, ...remainingNames } = list.memberNames ?? {}
      return {
        ...list,
        memberIds: list.memberIds.filter((id) => id !== memberId),
        memberNames: remainingNames,
      }
    }),
  }
}
```

Die Reducer `listMemberAdded` und `listMemberRemoved` rufen sie auf (Deklaration unverändert `role: 'event', on: 'list'`):

```ts
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly listId: string
          readonly memberId: string
          readonly name: string
        }>,
      ): ListsState =>
        withMember(state, action.payload.listId, action.payload.memberId, action.payload.name),
```

```ts
      reducer: (
        state: ListsState,
        action: PayloadAction<{ readonly listId: string; readonly memberId: string }>,
      ): ListsState =>
        withoutMember(state, action.payload.listId, action.payload.memberId),
```

Direkt nach `listMemberRemoved` zwei neue Reducer:

```ts
    // Local-only: the friend was tapped, the command is still travelling.
    // The row must appear now; if the server refuses, listMemberRemovedLocally
    // takes it back off. The real listMemberAdded arrives with the next pull.
    listMemberAddedLocally: {
      role: 'localEvent',
      reducer: (
        state: ListsState,
        action: PayloadAction<{
          readonly listId: string
          readonly memberId: string
          readonly name: string
        }>,
      ): ListsState =>
        withMember(state, action.payload.listId, action.payload.memberId, action.payload.name),
    },

    // Local-only: the server already wrote listMemberRemoved (or refused an
    // add). Folding this now makes the row disappear one pull earlier; the
    // real event folds on top later and the reducer, being total, absorbs it.
    listMemberRemovedLocally: {
      role: 'localEvent',
      reducer: (
        state: ListsState,
        action: PayloadAction<{ readonly listId: string; readonly memberId: string }>,
      ): ListsState =>
        withoutMember(state, action.payload.listId, action.payload.memberId),
    },
```

Beide in `export const { … } = listsSlice.actions` aufnehmen.

- [ ] **Step 3: Dasselbe in `recipesSlice.ts`**

Über `const recipesSlice = createSlice({`:

```ts
function withMember(
  state: RecipesState,
  recipeId: string,
  memberId: string,
  name: string,
): RecipesState {
  return {
    ...state,
    recipes: state.recipes.map((recipe) =>
      recipe.id === recipeId
        ? {
            ...recipe,
            memberIds: recipe.memberIds.includes(memberId)
              ? recipe.memberIds
              : [...recipe.memberIds, memberId],
            memberNames: { ...recipe.memberNames, [memberId]: name },
          }
        : recipe,
    ),
  }
}

function withoutMember(
  state: RecipesState,
  recipeId: string,
  memberId: string,
): RecipesState {
  return {
    ...state,
    recipes: state.recipes.map((recipe) => {
      if (recipe.id !== recipeId) return recipe
      const { [memberId]: _removed, ...remainingNames } = recipe.memberNames ?? {}
      return {
        ...recipe,
        memberIds: recipe.memberIds.filter((id) => id !== memberId),
        memberNames: remainingNames,
      }
    }),
  }
}
```

`recipeMemberAdded` (Deklaration bleibt `role: 'event', on: 'recipe'`):

```ts
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly recipeId: string
          readonly memberId: string
          readonly name: string
        }>,
      ): RecipesState =>
        withMember(state, action.payload.recipeId, action.payload.memberId, action.payload.name),
```

`recipeMemberRemoved`:

```ts
      reducer: (
        state: RecipesState,
        action: PayloadAction<{ readonly recipeId: string; readonly memberId: string }>,
      ): RecipesState =>
        withoutMember(state, action.payload.recipeId, action.payload.memberId),
```

Direkt nach `recipeMemberRemoved`:

```ts
    // Local-only: the friend was tapped, the command is still travelling.
    // The row must appear now; if the server refuses, recipeMemberRemovedLocally
    // takes it back off. The real recipeMemberAdded arrives with the next pull.
    recipeMemberAddedLocally: {
      role: 'localEvent',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly recipeId: string
          readonly memberId: string
          readonly name: string
        }>,
      ): RecipesState =>
        withMember(state, action.payload.recipeId, action.payload.memberId, action.payload.name),
    },

    // Local-only: the server already wrote recipeMemberRemoved (or refused an
    // add). Folding this now makes the row disappear one pull earlier; the
    // real event folds on top later and the reducer, being total, absorbs it.
    recipeMemberRemovedLocally: {
      role: 'localEvent',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{ readonly recipeId: string; readonly memberId: string }>,
      ): RecipesState =>
        withoutMember(state, action.payload.recipeId, action.payload.memberId),
    },
```

Beide in `export const { … } = recipesSlice.actions` aufnehmen.

- [ ] **Step 4: `memberCommands.ts`**

Imports: `fromServer` entfernen; aus den Slices statt `listMemberAdded`/`listMemberRemoved` bzw. `recipeMemberAdded`/`recipeMemberRemoved` die vier `…Locally`-Creators importieren. Die beiden Funktionen:

```ts
/**
 * The member-added fact of this device, dispatched the moment the friend is
 * tapped, before the command has travelled: the row must appear now, not one
 * round trip later. If the server refuses, memberRemovedLocally takes it
 * back off.
 */
export function memberAddedLocally(
  aggregate: Aggregate,
  memberId: string,
  name: string,
) {
  return aggregate.kind === 'recipe'
    ? recipeMemberAddedLocally({ recipeId: aggregate.id, memberId, name })
    : listMemberAddedLocally({ listId: aggregate.id, memberId, name })
}

/**
 * The member-removed fact of this device. Dispatched right after the command
 * succeeded (or after an add was refused): the server's event would only
 * arrive with the next pull — and if this device removed itself, never.
 */
export function memberRemovedLocally(aggregate: Aggregate, memberId: string) {
  return aggregate.kind === 'recipe'
    ? recipeMemberRemovedLocally({ recipeId: aggregate.id, memberId })
    : listMemberRemovedLocally({ listId: aggregate.id, memberId })
}
```

Im Dateikopf-Kommentar den Satz „The events they cause … reach this device through the cursor catch-up." unverändert lassen.

- [ ] **Step 5: `fromServer.ts` löschen**

```bash
git rm apps/mobile/src/app/fromServer.ts
```

Run: `grep -rn "fromServer" src test` — Expected: keine Treffer.

- [ ] **Step 6: Suite und Typprüfung**

Run: `pnpm test` — Expected: alle grün.
Run: `pnpm exec tsc --noEmit` — Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add -A apps/mobile/src/features apps/mobile/src/app/fromServer.ts apps/mobile/test/features/sharing
git commit -m "refactor(sharing): the friend tap dispatches local facts instead of faking a server echo"
```

---

### Task 7: Doku nachziehen

`status.md` warnt selbst: eine Doku, die nicht mehr stimmt, ist schädlicher als keine.

**Files:**
- Modify: `architecture/sync-engine.md` (§3 letzter Absatz, §6 Klasse-Aufzählung)
- Modify: `architecture/design-decisions.md` (Abschnitt „Zwei Arten von Endpunkten")
- Modify: `services/events.md` (Zeile 41 und 197–201)
- Modify: `apps/mobile/src/app/sync/README.md` (Zeilen 19, 67, 71, 96–101, 195, Mermaid-Label `toOutboxEntry`)
- Modify: `architecture/status.md` (§2, Absatz „Sync-Engine Stufe 1", Satz „Policy: …")
- Modify: `cleanup-model.todo` (Status-Block am Ende)
- Modify: `sync-engine.txt` (Abschnitt „Was "synced" konkret bedeutet", Dateiliste)

- [ ] **Step 1: `architecture/sync-engine.md`**

§3, den Absatz „Der Boolean allein reicht aber nicht …" ersetzen durch:

> Der Boolean allein reicht aber nicht: Ein synced Slice mischt Kategorien — echte Domain-Events, Fakten die bewusst lokal bleiben, und Ergebnisse von Abfragen. Deshalb **deklariert jeder Reducer eines synced Slice seine Rolle** (`event | localEvent | observation | hydration`), und ein `event` nennt zusätzlich sein Aggregate: `on: 'list'` (liegt auf einem bestehenden Log) oder `opens: 'list'` (eröffnet ein neues Log und geht deshalb an die Collection, wo der Server Ownership bootstrappt). Der Compiler erzwingt, dass das Payload das Aggregate-Feld (`listId`, `recipeId`) trägt. Aus den Deklarationen aller synced Slices komponiert `app/sync/appSyncPolicy.ts` **eine** Policy, die `withSync` (ob pending), die Engine (wohin) und der Receive-Pfad (Wire-Übersetzung) nur noch konsumieren. Details: [design](../docs/superpowers/specs/2026-09-04-sync-declaration-design.md).

§6, im Absatz „Klasse 1 — kollaborative Domain-Events" nach dem ersten Satz ergänzen:

> `listCreated` und `recipeCreated` gehören dazu — sie *eröffnen* ein Log, für das noch keine Membership existiert, und gehen deshalb an `POST /lists` bzw. `POST /recipes`, wo der Server Ownership claimt und das Event wörtlich appended. Sie sind keine Commands: Der Client erzeugt die Id, wendet sofort an, und ein Gast arbeitet ohne Server damit.

- [ ] **Step 2: `architecture/design-decisions.md`**

Im Abschnitt „Zwei Arten von Endpunkten: Events und Commands" nach dem Absatz zu Klasse 1 einen Absatz einfügen:

> **Eröffnende Events.** `listCreated` und `recipeCreated` sind Klasse-1-Events mit eigenem Endpunkt (`POST /lists`, `POST /recipes`): Es gibt noch keinen Log, an den sie appended werden könnten, und keine Membership, die der generische Pfad prüfen könnte. Der Server claimt Ownership für den Aufrufer und appended das Event des Clients unverändert. Im Client heißt das `opens: 'list'` statt `on: 'list'` — eine Routing-Eigenschaft, kein Command.

- [ ] **Step 3: `services/events.md`**

Zeile 41 (Tabellenzeile `listCreated`): „**2** — erzeugt die Autorisierungswurzel: …" → „**1, eigener Endpunkt** — eröffnet den Log: `POST /lists`, Server prüft `createdBy` = Aufrufer, claimt Ownership atomar und appended das Event des Clients". Zeilen 197–201: das Wort „Hybrid" und den Nebensatz „wird aber über den Klasse-2-Command …" ersetzen durch „`recipeCreated` ist — wie `listCreated` — ein **eröffnendes Klasse-1-Event**: Es steht in der Allowlist (Envelope und Schema prüfen es) und geht an den eigenen Endpunkt `POST /recipes`, weil noch kein Log existiert."

- [ ] **Step 4: `apps/mobile/src/app/sync/README.md`**

- Zeile 19: „…plus naming the reducer's role (`event | command | …`)…" → „…plus declaring the reducer (`role: 'event'` with `on`/`opens`, or `localEvent | observation | hydration`, see `app/createSlice.ts`). Still no `if` in the sync path — the composed policy looks it up."
- Zeile 67 (`app/syncMiddleware.ts`): unverändert.
- Zeile 71 (`app/createSlice.ts`) ersetzen: „`synced: true` on a slice forces every one of its reducers to declare itself (`role`, and for events `on`/`opens` naming the aggregate — the compiler checks the payload carries its id). The slice returns these `declarations`; `app/sync/appSyncPolicy.ts` composes them into the one `SyncPolicy` (`reachesServer`, `toOutboxEntry`, `domainPayloadOf`, `domainActionOf`) that `withSync`, the engine and the receive path consume."
- Nach Zeile 71 eine Zeile ergänzen: „**`features/sharing/memberCommands.ts`** — the class-2 commands (invite, join, add/remove member) are direct fetches; the optimistic rows they show come from `localEvent` actions (`listMemberAddedLocally`, …), never from a faked server echo."
- Send path, Punkt 5 ersetzen durch: „`policy.toOutboxEntry()` decides the routing at enqueue time — every entry is uniformly `{ path, wire }`: `meta.remote` or a role other than `event` → `null`; `on: 'list'` → `{ path: '/lists/{listId}/events', wire: action }`; `opens: 'list'` → `{ path: '/lists', wire }` with `ownerId → createdBy`. An event that could not be routed does not exist — the declaration's type demands the id field."
- Zeile 195: „translated back to domain form via `domainActionOf`" → „translated back to domain form via `policy.domainActionOf`".
- Mermaid: `ENG -->|toOutboxEntry| OB` → `ENG -->|policy.toOutboxEntry| OB`.

- [ ] **Step 5: `architecture/status.md`**

Im Absatz „Sync-Engine Stufe 1" den Satz „Policy: `synced: true` am Slice; einzige Klasse-2-Ausnahme `listCreated` → `POST /lists`." ersetzen durch: „Policy (seit 2026-09-04): `synced: true` am Slice + Deklaration pro Reducer (`role`, für Events `on`/`opens`), komponiert in `app/sync/appSyncPolicy.ts`; `listCreated`/`recipeCreated` sind eröffnende Events (`opens`) → Collection-Endpunkt, keine Commands." Den Datums-Header auf `2026-09-04` setzen.

- [ ] **Step 6: `cleanup-model.todo`**

Den Status-Block ab `Status (2026-09-04): Punkte 1, 3 und 5 sind UMGESETZT.` bis zum Dateiende ersetzen durch:

```
Status (2026-09-04, zweiter Schritt): Punkte 1, 2, 3 und 5 sind UMGESETZT.
Design: docs/superpowers/specs/2026-09-04-sync-declaration-design.md
Plan:   docs/superpowers/plans/2026-09-04-sync-declaration.md

Jeder Reducer eines synced Slice traegt eine Deklaration: role
(event | localEvent | observation | hydration), und ein event nennt sein
Aggregate als on: 'list' (liegt auf dem Log) oder opens: 'list' (eroeffnet
den Log -> Collection-Endpunkt). Der Compiler erzwingt das Aggregate-Feld im
Payload. app/sync/appSyncPolicy.ts komponiert daraus explizit eine Policy;
withSync, Engine und Receive-Pfad konsumieren sie. Keine globale Registry,
kein aggregateOf(), kein needsSync.ts/toOutboxEntry.ts, kein fromServer.ts.

Punkt 1: listLeft heisst listDropped — die eine lokale Tatsache "dieses
Geraet haelt die Liste nicht mehr", fuer Verlassen und Zugriffsverlust.
Punkt 2: entschieden — listCreated/recipeCreated sind Tatsachen (Events, die
ein Log eroeffnen), keine Commands. Die Rolle 'command' und der .match()-
Sonderfall sind weg; "Plan 2" ist hinfaellig. Echte Commands sind die Thunks
in memberCommands.ts, wie bisher.
Punkt 3: unveraendert erledigt (observation).
Punkt 5: erledigt — Klassifikation UND Routing kommen aus einer Deklaration;
der zweite Nicht-Sync-Mechanismus (gefaelschtes meta.remote in
memberAddedLocally) ist durch listMemberAddedLocally/… (localEvent) ersetzt.

Punkt 4 (meta.origin): bewusst nicht umgesetzt — seit dem Ende der
remote-Faelschung bedeutet remote wieder genau "kam vom Server".
Punkt 6 (Kopplung Action/Event/Wire): unberuehrt, bewusste Grundentscheidung.
```

- [ ] **Step 7: `sync-engine.txt`**

Abschnitt „Was "synced" konkret bedeutet" ersetzen durch:

```
Was "synced" konkret bedeutet
-----------------------------
Nicht jede Action wird synchronisiert. Die Entscheidung steht am Reducer:

- Ein Slice meldet sich mit `synced: true` in `createSlice(...)` an.
- Jeder Case-Reducer deklariert dann seine Rolle:
  `event | localEvent | observation | hydration`. Ein `event` nennt sein
  Aggregate: `on: 'list'` (liegt auf dem Listen-Log) oder `opens: 'list'`
  (eroeffnet ein neues Log). Der Compiler erzwingt, dass das Payload
  `listId`/`recipeId` traegt.
- `app/sync/appSyncPolicy.ts` komponiert die Deklarationen aller synced
  Slices zu einer Policy. Sie beantwortet:
  - `reachesServer(action)`: hat `meta`, nicht `remote`, Rolle `event`?
    -> pending + Outbox
  - `toOutboxEntry(action)`: `on` -> `/lists/{id}/events`,
    `opens` -> `/lists` (mit `ownerId -> createdBy`)

Nur `event` verlaesst das Geraet. `listCreated` ist ein Event, das ein Log
eroeffnet — kein Command. Echte Commands (Invite, Join, Member entfernen)
sind Thunks in `features/sharing/memberCommands.ts` und werden nie zu
Slice-Actions.
```

In der Dateiliste den Eintrag `send/toOutboxEntry.ts` ersetzen durch `apps/mobile/src/app/sync/syncPolicy.ts` („Die Policy-Kante: Rolle -> ob, on/opens -> wohin") und `apps/mobile/src/app/sync/appSyncPolicy.ts` („Die explizite Komposition aus den drei Slices"). In den Lese-Reihenfolgen `toOutboxEntry.ts` → `syncPolicy.ts`.

- [ ] **Step 8: Commit**

```bash
git add architecture/sync-engine.md architecture/design-decisions.md architecture/status.md services/events.md apps/mobile/src/app/sync/README.md cleanup-model.todo sync-engine.txt docs/superpowers/specs/2026-09-04-sync-declaration-design.md docs/superpowers/plans/2026-09-04-sync-declaration.md
git commit -m "docs(sync): one declaration per event answers whether and where; listCreated opens a log"
```

---

## Nach Abschluss

- `pnpm test`, `pnpm exec tsc --noEmit` und `pnpm build` in `apps/mobile` grün.
- `grep -rn "'command'" apps/mobile/src` liefert nichts.
- Der Nutzer entscheidet über den Commit der bis dahin ungetrackten Dateien (`docs/`, `cleanup-model.todo`, `sync-engine.txt`) — Task 7 staged sie, committet aber nur auf Ansage.
