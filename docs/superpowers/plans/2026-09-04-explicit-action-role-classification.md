# Explizite Action-Rollen-Klassifikation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ersetzt die Payload-Feldname-Heuristik (`aggregateOf()`/`needsSync()` raten anhand von `listId`/`recipeId`, ob eine Action synced werden muss) durch eine explizite, typsicher erzwungene `role`-Deklaration pro Reducer in den drei `synced: true`-Slices.

**Architecture:** Jeder Case-Reducer eines `synced: true`-Slice bekommt ein Pflichtfeld `role` (`event | command | localEvent | observation | hydration`), erzwungen über einen zweiten `createSlice`-Overload. `createSlice` führt daraus eine Registry `actionType → role` und exportiert `roleOf()`. `needsSync()` schlägt dort direkt nach und entscheidet über eine exhaustive Tabelle `REACHES_SERVER`. Keine Middleware, kein `meta.role` — die Rolle hängt am Action-Type und muss nicht mitreisen.

**Tech Stack:** TypeScript, Redux (eigenes `createSlice` ohne Immer/RTK), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-explicit-action-role-classification-design.md`

## Global Constraints

- Alle Kommandos laufen im Verzeichnis `apps/mobile`.
- Kein neues `any` außer im bereits bestehenden Muster von `createSlice.ts` (dort ist `any` die vorhandene Inferenz-Technik).
- `const` statt `let`, `readonly` auf allen neuen Properties. Kommentare im Code auf Englisch.
- **Bestehende Tests dürfen angepasst werden** — vom Nutzer explizit autorisiert. Aber nur die Tests, die unten benannt sind.
- **Die bestehenden Inferenz-Typen `InferPayload`, `RawActionCreator`, `RawActionCreatorFromFunction`, `RawActionCreatorFromPrepare` werden NICHT verändert.** Sie tragen die Payload-Typen aller acht Slices. Die Rollen-Form wird ihnen über `WithoutRole<R>` vorgeschaltet.
- **`ActionMeta` bekommt KEIN `role`-Feld.** `meta` geht über den Draht (`sendEntry.ts`), die Rolle ist clientintern.
- `role: 'command'` ändert in diesem Plan **kein Verhalten** — der `.match()`-Sonderfall in `toOutboxEntry.ts` bleibt, wie er ist.
- **Erwartetes rotes Fenster:** Nach Task 1 schlägt `tsc --noEmit` in den drei synced Slices fehl, bis Task 4 fertig ist. `pnpm test` bleibt durchgehend grün (Vitest typprüft nicht). Reihenfolge Task 1 → 2 → 3 → 4 → 5 → 6 ist bindend: Task 5 (Payload-Rename + `needsSync`-Umstellung) muss nach allen Rollen-Deklarationen kommen, sonst gäbe es ein Fenster, in dem `listLeft` tatsächlich in die Outbox liefe.

---

### Task 1: `ActionRole`, Registry und Pflichtfeld in `createSlice.ts`

**Files:**
- Modify: `apps/mobile/src/app/createSlice.ts`
- Test: `apps/mobile/test/app/createSlice.test.ts` (nur ergänzen; bestehender Test bleibt unverändert)

**Interfaces:**
- Produces: `ActionRole`, `roleOf(type: string): ActionRole | undefined`, `createSlice`-Overload für `synced: true` mit Pflichtfeld `role` pro Reducer.
- Consumes: nichts Neues.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `apps/mobile/test/app/createSlice.test.ts` am Dateiende **ergänzen** (der bestehende `describe('synced slices')`-Block bleibt unverändert stehen):

```ts
describe('action role registry', () => {
  it('registriert die deklarierte Rolle eines synced Reducers', () => {
    createSlice({
      name: 'roledDemo',
      initialState: {},
      synced: true,
      reducers: {
        somethingHappened: {
          role: 'event',
          reducer: (state: object) => state,
        },
        somethingLoaded: {
          role: 'hydration',
          reducer: (state: object) => state,
        },
      },
    })

    expect(roleOf('roledDemo/somethingHappened')).toBe('event')
    expect(roleOf('roledDemo/somethingLoaded')).toBe('hydration')
  })

  it('kennt keine Rolle für Actions unsynced Slices', () => {
    createSlice({
      name: 'unroledDemo',
      initialState: {},
      reducers: { somethingHappened: (state: object) => state },
    })

    expect(roleOf('unroledDemo/somethingHappened')).toBeUndefined()
  })

  it('kennt keine Rolle für unbekannte Action-Typen', () => {
    expect(roleOf('never/registered')).toBeUndefined()
  })

  it('erzeugt für die Rollen-Form weiterhin funktionierende Action Creators', () => {
    const slice = createSlice({
      name: 'creatorDemo',
      initialState: { seen: '' },
      synced: true,
      reducers: {
        thingRenamed: {
          role: 'event',
          reducer: (
            state: { readonly seen: string },
            action: PayloadAction<{ readonly name: string }>,
          ) => ({ seen: action.payload.name }),
        },
      },
    })

    const action = slice.actions.thingRenamed({ name: 'Brot' })

    expect(action).toEqual({
      type: 'creatorDemo/thingRenamed',
      payload: { name: 'Brot' },
    })
    expect(slice.reducer({ seen: '' }, action)).toEqual({ seen: 'Brot' })
  })
})
```

Und die Import-Zeile am Dateikopf ersetzen:

```ts
import { createSlice, belongsToSyncedSlice } from '@/app/createSlice'
```

durch:

```ts
import {
  createSlice,
  belongsToSyncedSlice,
  roleOf,
  type PayloadAction,
} from '@/app/createSlice'
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `pnpm vitest run test/app/createSlice.test.ts`
Expected: FAIL — `roleOf` ist kein Export von `@/app/createSlice`.

- [ ] **Step 3: `createSlice.ts` erweitern**

Drei Ergänzungen, **ohne** die bestehenden Inferenz-Typen anzufassen.

**(a)** Ganz oben, direkt unter dem Datei-Kommentar, den Rollen-Typ einfügen:

```ts
/**
 * The sync classification of an action, declared once at the reducer that
 * owns it (design: docs/superpowers/specs/2026-09-04-explicit-action-role-classification-design.md).
 *
 * - event: a real domain fact caused by a user action, part of the aggregate log
 * - command: event-shaped, but server-authoritative (class 2) — the server
 *   claims ownership and writes the event itself. Today this label only
 *   documents the special case in toOutboxEntry; the structural separation
 *   (dispatch through a dedicated thunk) is still outstanding.
 * - localEvent: a real domain fact whose distribution is deliberately limited
 *   to this device, because its authoritative version already reached the
 *   server through a command
 * - observation: a current value a query reported — no user action, no log entry
 * - hydration: restoring data this device already knew, from local storage
 */
export type ActionRole =
  | 'event'
  | 'command'
  | 'localEvent'
  | 'observation'
  | 'hydration'
```

**(b)** Bei den Reducer-Definitionen, direkt nach `type ReducerDefinition<S> = ...`, die Rollen-Form und das Unwrap ergänzen:

```ts
// A synced slice mixes categories — domain events, facts that stay local,
// query results — so the classification lives per reducer, not per slice.
// role is mandatory there: the overload below accepts no bare function.
type SyncedReducerDefinition<S> =
  | {
      readonly role: ActionRole
      readonly reducer: (state: S, action: PayloadAction<any>) => S
    }
  | {
      readonly role: ActionRole
      readonly prepare: (...args: any[]) => { readonly payload: any }
      readonly reducer: (state: S, action: PayloadAction<any>) => S
    }

// Maps a role-carrying definition back onto the shape the existing
// inference already understands, so none of it has to change.
type WithoutRole<R> = R extends {
  readonly role: ActionRole
  readonly prepare: infer P
  readonly reducer: infer F
}
  ? { readonly prepare: P; readonly reducer: F }
  : R extends { readonly role: ActionRole; readonly reducer: infer F }
    ? F
    : R
```

**(c)** `ActionCreators` so anpassen, dass es durch das Unwrap schaut (die einzige Änderung an der Inferenz):

```ts
type ActionCreators<Name extends string, R extends Record<string, any>> = {
  readonly [K in keyof R & string]: ActionCreatorWithMeta<
    RawActionCreator<Name, K, WithoutRole<R[K]>>,
    `${Name}/${K}`,
    InferPayload<WithoutRole<R[K]>>
  >
}
```

**(d)** Nach `belongsToSyncedSlice` die Registry ergänzen:

```ts
// --- Action role registry ---
//
// Filled only for reducers of a `synced: true` slice, each of which must
// declare a role (enforced by the overload below). needsSync reads this —
// the classification lives at the reducer, not in the payload's shape, and
// never has to travel with the action.
const roleByActionType = new Map<string, ActionRole>()

/** The declared role of an action type, or undefined outside any synced slice. */
export function roleOf(type: string): ActionRole | undefined {
  return roleByActionType.get(type)
}
```

**(e)** Die `createSlice`-Deklaration durch zwei Overloads plus eine Implementierung ersetzen. Der bisherige Funktionskopf (`export function createSlice<...>(config: {...}) {`) entfällt, der Rumpf wird angepasst:

```ts
export function createSlice<
  Name extends string,
  S,
  R extends Record<string, SyncedReducerDefinition<S>>,
>(config: {
  readonly name: Name
  readonly initialState: S
  readonly reducers: R
  readonly extraReducers?: readonly ExtraReducer<S>[]
  readonly synced: true
}): {
  readonly actions: ActionCreators<Name, R>
  readonly reducer: (state: S | undefined, action: { readonly type: string }) => S
}

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
}

export function createSlice(config: {
  readonly name: string
  readonly initialState: any
  readonly reducers: Record<string, any>
  readonly extraReducers?: readonly ExtraReducer<any>[]
  readonly synced?: boolean
}): {
  readonly actions: Record<string, any>
  readonly reducer: (state: any, action: { readonly type: string }) => any
} {
  if (config.synced) syncedSliceNames.add(config.name)

  const actionCreators = {} as Record<string, (...args: unknown[]) => unknown>
  const lookup: Record<string, (state: any, action: any) => any> = {}

  for (const key of Object.keys(config.reducers)) {
    const type = `${config.name}/${key}`
    const definition = config.reducers[key] as
      | ((state: any, action: any) => any)
      | {
          readonly role?: ActionRole
          readonly prepare?: (...args: unknown[]) => { readonly payload: unknown }
          readonly reducer: (state: any, action: any) => any
        }

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

    const prepare = definition.prepare
    const creator = prepare
      ? (...args: unknown[]) => ({ type, ...prepare(...args) })
      : (payload?: unknown) =>
          payload !== undefined ? { type, payload } : { type }
    creator.type = type
    creator.match = (action: { readonly type: string }): boolean =>
      action.type === type
    actionCreators[key] = creator
    lookup[type] = definition.reducer

    if (config.synced && definition.role !== undefined) {
      roleByActionType.set(type, definition.role)
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
  }
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `pnpm vitest run test/app/createSlice.test.ts`
Expected: PASS — bestehender Test plus vier neue grün.

- [ ] **Step 5: Volle Testsuite**

Run: `pnpm test`
Expected: Alle Tests grün (Vitest typprüft nicht; die Slices deklarieren noch keine Rollen, verhalten sich aber unverändert).

Run: `pnpm exec tsc --noEmit`
Expected: **Erwartete Fehler** in `listsSlice.ts`, `shoppingSlice.ts`, `recipesSlice.ts` (`synced: true` ohne `role`). Keine Fehler in anderen Dateien — falls doch, ist die Inferenz beschädigt und der Fehler muss vor dem Commit behoben werden.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/createSlice.ts apps/mobile/test/app/createSlice.test.ts
git commit -m "feat(sync): declare action roles at the reducer, expose a role registry"
```

---

### Task 2: `listsSlice.ts` — Rollen deklarieren

**Files:**
- Modify: `apps/mobile/src/features/lists/domain/listsSlice.ts` (nur der `reducers`-Block)

**Interfaces:**
- Consumes: `ActionRole`-Form aus Task 1.
- Produces: unveränderte Action-Namen und Payloads. **Der Payload-Rename von `listLeft` passiert NICHT hier, sondern in Task 5.**

- [ ] **Step 1: Jeden Case-Reducer in die Rollen-Form überführen**

In `apps/mobile/src/features/lists/domain/listsSlice.ts` bleibt jeder Reducer-Rumpf **wortgleich**; nur die Umhüllung ändert sich. Aus

```ts
    listRenamed: (
      state: ListsState,
      action: PayloadAction<{ ... }>,
    ): ListsState => ({ ... }),
```

wird

```ts
    listRenamed: {
      role: 'event',
      reducer: (
        state: ListsState,
        action: PayloadAction<{ ... }>,
      ): ListsState => ({ ... }),
    },
```

Zuordnung für alle zehn Reducer dieses Slice:

| Reducer | Rolle |
|---|---|
| `listsLoaded` | `'hydration'` |
| `listCreated` | `'command'` |
| `listRenamed` | `'event'` |
| `listLeft` | `'localEvent'` |
| `listRestored` | `'localEvent'` |
| `listDeleted` | `'event'` |
| `listMemberAdded` | `'event'` |
| `listMemberRemoved` | `'event'` |
| `memberLimitLoaded` | `'observation'` |
| `ownerNamesLoaded` | `'observation'` |

Die bestehenden Kommentare über den Reducern bleiben erhalten. Zwei davon erklären den alten Hack und werden ersetzt:

- Über `listLeft` steht heute *"Der payload nennt die id `id` und nicht `listId` on purpose: a `listId` at the root would put this into the outbox…"*. Ersetzen durch: `// Local-only: I left this list. The server wrote the member-removed event, but it will never reach me — leaving ends my access to that log.`
- Über `listRestored` steht die analoge Begründung *"Names the payload `list` and not `listId` for the same reason listLeft does…"*. Diesen Satz streichen, den Rest des Kommentars behalten.
- Über `memberLimitLoaded` und `ownerNamesLoaded` steht je *"No listId at the payload root, so needsSync() keeps it out of the outbox."* — durch `// Observation: comes from GET /lists, not from a user action.` ersetzen.

Der `extraReducers`-Block am Ende des Slice bleibt **unverändert** (fremde Action-Typen brauchen keine Rolle).

- [ ] **Step 2: Tests ausführen**

Run: `pnpm test`
Expected: Alle Tests grün — das Verhalten ändert sich nicht, nur die Deklarationsform.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/lists/domain/listsSlice.ts
git commit -m "refactor(lists): declare an explicit role for every action"
```

---

### Task 3: `shoppingSlice.ts` — Rollen deklarieren

**Files:**
- Modify: `apps/mobile/src/features/shopping/domain/shoppingSlice.ts` (nur der `reducers`-Block)

**Interfaces:**
- Consumes: `ActionRole`-Form aus Task 1.
- Produces: unveränderte Action-Namen und Payloads.

- [ ] **Step 1: Jeden Case-Reducer in die Rollen-Form überführen**

Gleiche mechanische Umhüllung wie in Task 2 (Rumpf wortgleich, nur `{ role, reducer: … }` darum). Zuordnung für alle acht Reducer:

| Reducer | Rolle |
|---|---|
| `shoppingLoaded` | `'hydration'` |
| `itemAdded` | `'event'` |
| `itemChecked` | `'event'` |
| `itemUnchecked` | `'event'` |
| `itemRemoved` | `'event'` |
| `itemUpdated` | `'event'` |
| `itemNoteUpdated` | `'event'` |
| `customVariantAdded` | `'event'` |

Der `extraReducers`-Block (`listDeleted`, `listLeft`, `identityAttached`) bleibt in diesem Task **unverändert** — sein `listLeft`-Payload zieht in Task 5 mit dem Rename mit.

- [ ] **Step 2: Tests ausführen**

Run: `pnpm test`
Expected: Alle Tests grün.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/shopping/domain/shoppingSlice.ts
git commit -m "refactor(shopping): declare an explicit role for every action"
```

---

### Task 4: `recipesSlice.ts` — Rollen deklarieren

**Files:**
- Modify: `apps/mobile/src/features/recipes/domain/recipesSlice.ts` (nur der `reducers`-Block)

**Interfaces:**
- Consumes: `ActionRole`-Form aus Task 1.
- Produces: unveränderte Action-Namen und Payloads. Der Payload-Rename von `recipeLeft` passiert in Task 5.

- [ ] **Step 1: Jeden Case-Reducer in die Rollen-Form überführen**

Gleiche mechanische Umhüllung. Zuordnung für alle acht Reducer:

| Reducer | Rolle |
|---|---|
| `recipesLoaded` | `'hydration'` |
| `recipeCreated` | `'command'` |
| `recipeUpdated` | `'event'` |
| `recipeLeft` | `'localEvent'` |
| `recipeDeleted` | `'event'` |
| `recipeMemberAdded` | `'event'` |
| `recipeMemberRemoved` | `'event'` |
| `recipeOwnerNamesLoaded` | `'observation'` |

Auch hier zwei Kommentare ersetzen:
- Über `recipeLeft` den Satz *"The payload names the id `id` and not `recipeId` on purpose…"* streichen, den ersten Satz behalten.
- Über `recipeOwnerNamesLoaded` *"Carries no recipeId at the payload root, so needsSync() keeps it out of the outbox."* durch `// Observation: comes from GET /recipes, not from a user action.` ersetzen.

- [ ] **Step 2: Tests und Typprüfung**

Run: `pnpm test`
Expected: Alle Tests grün.

Run: `pnpm exec tsc --noEmit`
Expected: **Keine Fehler mehr** — das rote Fenster aus Task 1 ist damit geschlossen.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipes/domain/recipesSlice.ts
git commit -m "refactor(recipes): declare an explicit role for every action"
```

---

### Task 5: `needsSync()` auf die Rollen-Tabelle umstellen und den Payload-Hack entfernen

Dieser Task ist bewusst atomar: die Klassifikation wechselt und der Payload-Rename passiert zusammen. Getrennt gäbe es ein Fenster, in dem `listLeft` mit `listId` von der alten Heuristik als syncbar erkannt und an eine verlassene Liste gepostet würde.

**Files:**
- Modify: `apps/mobile/src/app/sync/needsSync.ts` (ersetzen)
- Modify: `apps/mobile/src/features/lists/domain/listsSlice.ts` (`listLeft`-Payload)
- Modify: `apps/mobile/src/features/recipes/domain/recipesSlice.ts` (`recipeLeft`-Payload)
- Modify: `apps/mobile/src/features/lists/domain/leaveList.ts:38`
- Modify: `apps/mobile/src/app/sync/startSync.ts:63-66`
- Modify: `apps/mobile/src/features/preferences/domain/preferencesSlice.ts:88-96`
- Modify: `apps/mobile/src/features/shopping/domain/shoppingSlice.ts` (extraReducer für `listLeft`)
- Modify: `apps/mobile/test/features/lists/domain/listsSlice.listLeft.test.ts`
- Test: `apps/mobile/test/app/sync/needsSync.test.ts` (neu)

**Interfaces:**
- Consumes: `roleOf`, `ActionRole` (Task 1); die Rollen-Deklarationen (Tasks 2–4).
- Produces: `needsSync(action): boolean` mit unveränderter Signatur.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Erstelle `apps/mobile/test/app/sync/needsSync.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSlice, type PayloadAction } from '@/app/createSlice'
import { needsSync } from '@/app/sync/needsSync'

// A slice of its own, so the test states the rule rather than leaning on
// whatever roles the feature slices happen to declare today.
const demo = createSlice({
  name: 'needsSyncDemo',
  initialState: {},
  synced: true,
  reducers: {
    anEvent: { role: 'event', reducer: (state: object) => state },
    aCommand: { role: 'command', reducer: (state: object) => state },
    aLocalEvent: { role: 'localEvent', reducer: (state: object) => state },
    anObservation: { role: 'observation', reducer: (state: object) => state },
    aHydration: { role: 'hydration', reducer: (state: object) => state },
  },
})

const meta = { eventId: 'e1', deviceId: 'd1' }

const dispatched = (
  creator: { readonly type: string },
): PayloadAction<unknown> => ({ type: creator.type, payload: {}, meta })

describe('needsSync', () => {
  it('schickt event-Actions zum Server', () => {
    expect(needsSync(dispatched(demo.actions.anEvent))).toBe(true)
  })

  it('schickt command-Actions zum Server', () => {
    expect(needsSync(dispatched(demo.actions.aCommand))).toBe(true)
  })

  it('behält localEvent-Actions auf dem Gerät', () => {
    expect(needsSync(dispatched(demo.actions.aLocalEvent))).toBe(false)
  })

  it('behält observation-Actions auf dem Gerät', () => {
    expect(needsSync(dispatched(demo.actions.anObservation))).toBe(false)
  })

  it('behält hydration-Actions auf dem Gerät', () => {
    expect(needsSync(dispatched(demo.actions.aHydration))).toBe(false)
  })

  it('schickt Actions ohne Rolle nie', () => {
    expect(
      needsSync({ type: 'preferences/themeChanged', payload: {}, meta }),
    ).toBe(false)
  })

  it('schickt Server-Echos nie zurück', () => {
    expect(
      needsSync({
        type: demo.actions.anEvent.type,
        payload: {},
        meta: { ...meta, remote: true },
      }),
    ).toBe(false)
  })

  it('schickt Actions ohne meta nie', () => {
    expect(needsSync({ type: demo.actions.anEvent.type, payload: {} })).toBe(
      false,
    )
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `pnpm vitest run test/app/sync/needsSync.test.ts`
Expected: FAIL — die heutige Implementierung sucht `listId` im Payload, die Demo-Payloads sind leer; die `event`/`command`-Fälle erwarten `true`, bekommen aber `false`.

- [ ] **Step 3: `needsSync.ts` ersetzen**

Ersetze den **gesamten Inhalt** von `apps/mobile/src/app/sync/needsSync.ts` mit:

```ts
// The sync-membership predicate, shared by the send path (what enters the
// outbox) and by withSync (what enters the pending queue). One source of
// truth — the two must never disagree.
//
// Reads the role declared at the reducer (createSlice.ts). No payload
// inspection: which aggregate an event belongs to is a routing question and
// stays in toOutboxEntry
// (design: docs/superpowers/specs/2026-09-04-explicit-action-role-classification-design.md).

import { roleOf, type ActionRole, type PayloadAction } from '../createSlice'

/**
 * Which roles travel to the server. A table rather than a condition: the
 * three roles that stay local say so out loud, and a sixth role cannot be
 * added without deciding this here — the type demands the entry.
 */
const REACHES_SERVER: Readonly<Record<ActionRole, boolean>> = {
  event: true,
  command: true,
  localEvent: false,
  observation: false,
  hydration: false,
}

/**
 * True for own actions that must reach the server. Excludes server echoes
 * (meta.remote), the roles that stay on this device, and anything outside a
 * synced slice. Called on every dispatch, by toOutboxEntry and by withSync.
 */
export function needsSync(action: PayloadAction<unknown>): boolean {
  if (!action.meta || action.meta.remote) return false
  const role = roleOf(action.type)
  return role !== undefined && REACHES_SERVER[role]
}
```

- [ ] **Step 4: `listLeft` und `recipeLeft` ehrlich benennen**

In `listsSlice.ts` beim `listLeft`-Reducer `readonly id: string` → `readonly listId: string` und `action.payload.id` → `action.payload.listId`.

In `recipesSlice.ts` beim `recipeLeft`-Reducer `readonly id: string` → `readonly recipeId: string` und `action.payload.id` → `action.payload.recipeId`.

- [ ] **Step 5: Die vier Payload-Konsumenten mitziehen**

`apps/mobile/src/features/lists/domain/leaveList.ts:38`:

```ts
    dispatch(listLeft({ id: listId }))
```
→
```ts
    dispatch(listLeft({ listId }))
```

`apps/mobile/src/app/sync/startSync.ts:63-66`:

```ts
function dropped(aggregate: Aggregate) {
  return aggregate.kind === 'recipe'
    ? recipeLeft({ id: aggregate.id })
    : listLeft({ id: aggregate.id })
}
```
→
```ts
function dropped(aggregate: Aggregate) {
  return aggregate.kind === 'recipe'
    ? recipeLeft({ recipeId: aggregate.id })
    : listLeft({ listId: aggregate.id })
}
```

`apps/mobile/src/features/preferences/domain/preferencesSlice.ts`, im `extraReducers`-Eintrag mit `creator: listLeft`:

```ts
        action: PayloadAction<{ readonly id: string }>,
      ): PreferencesState => withoutList(state, action.payload.id),
```
→
```ts
        action: PayloadAction<{ readonly listId: string }>,
      ): PreferencesState => withoutList(state, action.payload.listId),
```

`apps/mobile/src/features/shopping/domain/shoppingSlice.ts`, im `extraReducers`-Eintrag mit `creator: listLeft`:

```ts
        action: PayloadAction<{ readonly id: string }>,
      ): ShoppingState => withoutList(state, action.payload.id),
```
→
```ts
        action: PayloadAction<{ readonly listId: string }>,
      ): ShoppingState => withoutList(state, action.payload.listId),
```

- [ ] **Step 6: Den bestehenden `listLeft`-Test anpassen**

In `apps/mobile/test/features/lists/domain/listsSlice.listLeft.test.ts` alle **vier** Vorkommen von `listLeft({ id: 'l1' })` durch `listLeft({ listId: 'l1' })` ersetzen.

Den Import

```ts
import { aggregateOf } from '@/app/sync/aggregate'
```

ersetzen durch

```ts
import { needsSync } from '@/app/sync/needsSync'
```

und den Test `'never reaches the outbox'` ersetzen:

```ts
  // Leaving ends my access to the log, so the server can never tell me
  // about it afterwards — the event must stay on this device.
  test('never reaches the outbox', () => {
    expect(
      aggregateOf({
        ...listLeft({ id: 'l1' }),
        meta: { eventId: 'e1', deviceId: 'd1' },
      }),
    ).toBeNull()
  })
```
→
```ts
  // Leaving ends my access to the log, so the server can never tell me
  // about it afterwards. role: 'localEvent' is what keeps it here now —
  // the payload may say listId like every other list event.
  test('never reaches the outbox', () => {
    expect(
      needsSync({
        ...listLeft({ listId: 'l1' }),
        meta: { eventId: 'e1', deviceId: 'd1' },
      }),
    ).toBe(false)
  })
```

- [ ] **Step 7: Volle Testsuite und Typprüfung**

Run: `pnpm vitest run test/app/sync/needsSync.test.ts`
Expected: PASS — alle acht Tests grün.

Run: `pnpm test`
Expected: Alle Tests grün, **inklusive `toOutboxEntry.test.ts` ohne jede Änderung** — dessen Fixtures importieren die Slices, damit ist die Registry gefüllt und `listCreated`/`recipeCreated`/`itemAdded`/`recipeUpdated` werden über ihre Rolle als serverbestimmt erkannt; `lists/listsLoaded` als `hydration` weiterhin nicht.

Run: `pnpm exec tsc --noEmit`
Expected: Keine Fehler.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/app/sync/needsSync.ts apps/mobile/src/features/lists/domain/listsSlice.ts apps/mobile/src/features/recipes/domain/recipesSlice.ts apps/mobile/src/features/lists/domain/leaveList.ts apps/mobile/src/app/sync/startSync.ts apps/mobile/src/features/preferences/domain/preferencesSlice.ts apps/mobile/src/features/shopping/domain/shoppingSlice.ts apps/mobile/test/app/sync/needsSync.test.ts apps/mobile/test/features/lists/domain/listsSlice.listLeft.test.ts
git commit -m "feat(sync): classify actions by declared role, drop the id/listId hack"
```

---

### Task 6: Architektur-Doku nachziehen

`status.md` warnt selbst, dass eine Doku, die nicht mehr stimmt, schädlicher ist als keine. Zwei Stellen beschreiben jetzt einen Mechanismus, den es so nicht mehr gibt.

**Files:**
- Modify: `architecture/sync-engine.md` (§3, die "ein Boolean pro Slice"-Regel)
- Modify: `apps/mobile/src/app/sync/README.md` (Zeilen 19 und 71)

**Interfaces:**
- Keine — reine Dokumentation.

- [ ] **Step 1: `sync-engine.md` §3 anpassen**

Die Stelle finden, die `synced: true` als "ein Boolean pro Slice, keine per-Action-ifs" beschreibt, und um die tatsächliche Regel ergänzen: Ein Slice meldet sich weiterhin mit `synced: true` an, aber **innerhalb** eines solchen Slice deklariert jeder Reducer seine Rolle (`event | command | localEvent | observation | hydration`), weil ein Slice Kategorien mischt — echte Domain-Events, Fakten die lokal bleiben, und Ergebnisse von Abfragen. Die Sync-Entscheidung folgt aus der Rolle über die Tabelle in `needsSync.ts`, nicht aus der Payload-Form. Auf die Spec verweisen: `docs/superpowers/specs/2026-09-04-explicit-action-role-classification-design.md`.

- [ ] **Step 2: `app/sync/README.md` anpassen**

Zeile 19 sagt heute: *"…ein neuer Event-Typ kostet **null Zeilen** Sync-Code: `synced: true` am Slice genügt."* Ergänzen: plus die Rollen-Deklaration am Reducer — weiterhin kein `if` im Sync-Pfad, aber die Rolle muss benannt werden.

Zeile 71 sagt: *"`synced: true` on a slice registers the slice name; `belongsToSyncedSlice()` feeds the shared `needsSync()` predicate."* Das stimmt nicht mehr: `needsSync()` liest jetzt `roleOf()`; `belongsToSyncedSlice()` bleibt als eigenständige Auskunft bestehen, speist aber das Prädikat nicht mehr.

- [ ] **Step 3: Commit**

```bash
git add architecture/sync-engine.md apps/mobile/src/app/sync/README.md
git commit -m "docs(sync): describe per-reducer action roles instead of the slice boolean"
```

---

## Nach Abschluss

`cleanup-model.todo` als umgesetzt markieren (Punkte 1, 3, 5 — Punkt 2 bleibt als Plan 2 offen, Punkt 4 und 6 unberührt).
