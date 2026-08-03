# Teilen: Swipe statt X, Rollen sichtbar, Rückfrage nur wo nötig — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Mitglieder-Screen stellt mich immer nach oben und markiert den Inhaber als Admin; Entfernen, Löschen und Verlassen laufen überall über dieselbe Wisch-Geste, und nachgefragt wird nur noch, wo etwas für **andere** verschwindet.

**Architecture:** Eine Regel trägt alles: *Rückfrage genau dann, wenn Daten für andere Leute weg sind.* Daraus folgt — private Liste/Rezept löschen: sofort; geteilte Liste/Rezept löschen: Rückfrage; verlassen: Rückfrage (es ist per Definition geteilt); Mitglied entfernen: sofort, weil dabei nichts vernichtet wird. Rezepte bekommen dieselbe Rollen-Logik wie Listen (Task 9 des Vorgängerplans), inklusive des Avatar-Fehlers, der dort noch steckt.

**Tech Stack:** React 19 + TanStack Router + Redux (eigenes `createSlice` ohne Immer), Vitest.

## Global Constraints

- **Bestehende Tests werden NICHT geändert.** Bricht eine Änderung einen bestehenden Test: STOPPEN, melden, auf Entscheidung warten. Neue Tests sind erwünscht.
- **Commits nur auf ausdrückliche Ansage.**
- **Kein `any`, kein `as`-Casting, `const` statt `let`, `readonly` auf Properties, `type` statt `interface`. Kommentare auf Englisch.**
- **Business-Logik gehört in Reducer und Selektoren, nicht in Komponenten.** Selektoren leben im Slice.
- **Reducer bleiben replay-pur:** kein `Date.now()`, `crypto.randomUUID()`, `Math.random()` in Reducern.
- **Namen sagen, was sie halten** (`architecture/backend-structure.md`, gilt auch im Frontend): eine Id heißt `…_id`/`…Id`, ein Wert heißt nach seinem Typ.
- **Sharing ist ein Mechanismus für alle Aggregate** (`architecture/sharing-model.md`): Was für Listen gilt, gilt für Rezepte — im selben Code, nicht in einer Kopie.
- Verifikation pro Task: `pnpm test` und `pnpm tsc --noEmit` in `apps/mobile`, am Ende zusätzlich `pnpm build`.

## Dateien im Überblick

| Datei | Verantwortung |
|---|---|
| `src/features/sharing/sharedMembers.ts` | **neu** — Reihenfolge der Mitglieder (ich zuerst) als reine Funktion |
| `src/features/sharing/MembersPage.tsx` | X-Button raus, Swipe rein, kein Entfernen-Dialog mehr |
| `src/features/sharing/leaveAggregate.ts` | **neu** — `leaveList` verallgemeinert auf Liste **und** Rezept |
| `src/features/lists/domain/leaveList.ts` | **gelöscht** — geht in `leaveAggregate.ts` auf |
| `src/features/recipes/domain/recipesSlice.ts` | `recipeLeft` (lokal), Gegenstück zu `listLeft` |
| `src/features/recipes/overview/RecipesPage.tsx` | Rollen-Logik: Verlassen statt Löschen, Rückfrage nur wenn geteilt |
| `src/features/recipes/overview/RecipeTile.tsx` | Besitzer-Zeile + Avatar-Überlapp (derselbe Fehler wie bei Listen) |
| `src/features/lists/overview/ListsPage.tsx` | Rückfrage nur noch bei geteilten Listen |
| `src/app/router.ts` | Besitzer-Namen auch für die Rezept-Übersicht laden |

## Offene Entscheidungen — vor Task 1 klären

1. **„Swipe bei allen anderen Items"** — im Plan umgesetzt sind die **Mitglieder** (dein „nämlich"). Die **Freundesliste** hat heute Swipe **mit** Rückfrage; nach der Regel oben müsste die Rückfrage dort ebenfalls fallen (es verschwindet nur mein eigener Adressbuch-Eintrag). Ist als **Task 7** enthalten — streichen, falls nicht gewollt. Einkaufs-Items sind **nicht** enthalten: dort ist Tippen das Abhaken, ein Swipe auf denselben Kacheln wäre eine zweite Bedeutung für dieselbe Fläche.
2. **Mich selbst im Mitglieder-Screen wegwischen?** Der Plan sagt **nein**: Bei der eigenen Zeile passiert beim Wischen nichts, Verlassen läuft über die Übersicht. Grund: Die eigene Zeile steht ab jetzt ganz oben und wäre die erste, die man versehentlich erwischt. Falls du es doch willst, wird aus Task 3 ein zusätzliches `label="Verlassen"` für die eigene Zeile.

---

### Task 1: Ich stehe oben, der Inhaber heißt Admin

Die Reihenfolge kommt heute aus `memberIds` (Beitritts-Reihenfolge, Owner zuerst). Neu: Der Betrachter zuerst, alle anderen behalten ihre Reihenfolge. Die Admin-Markierung **existiert bereits** (`role`-Zeile in `MemberCard`) — dieser Task ändert daran nichts außer der Position.

**Files:**
- Create: `apps/mobile/src/features/sharing/sharedMembers.ts`
- Modify: `apps/mobile/src/features/sharing/MembersPage.tsx`
- Test: `apps/mobile/test/features/sharing/sharedMembers.test.ts`

**Interfaces:**
- Consumes: `SharedMember` aus `features/sharing/MembersPage` (`{ id, name, isOwner }`)
- Produces: `withViewerFirst(members: readonly SharedMember[], viewerId: string): readonly SharedMember[]`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/sharing/sharedMembers.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { withViewerFirst } from '@/features/sharing/sharedMembers'

const adnan = { id: 'adnan', name: 'Adnan', isOwner: true }
const chris = { id: 'chris', name: 'Chris', isOwner: false }
const sarah = { id: 'sarah', name: 'Sarah', isOwner: false }

describe('withViewerFirst', () => {
  // Wer draufschaut, sucht sich selbst nicht — man steht oben.
  test('puts the viewer first, even when the owner is somebody else', () => {
    expect(
      withViewerFirst([adnan, chris, sarah], 'chris').map((m) => m.id),
    ).toEqual(['chris', 'adnan', 'sarah'])
  })

  test('keeps the order of everybody else', () => {
    expect(
      withViewerFirst([adnan, chris, sarah], 'sarah').map((m) => m.id),
    ).toEqual(['sarah', 'adnan', 'chris'])
  })

  test('changes nothing when the viewer is already first', () => {
    expect(
      withViewerFirst([adnan, chris], 'adnan').map((m) => m.id),
    ).toEqual(['adnan', 'chris'])
  })

  // Ein Gerät ohne Identität schaut auf eine Liste, in der es nicht steht.
  test('leaves a list without the viewer untouched', () => {
    expect(
      withViewerFirst([adnan, chris], 'local-user').map((m) => m.id),
    ).toEqual(['adnan', 'chris'])
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test sharedMembers`
Expected: FAIL, Modul nicht gefunden

- [ ] **Step 3: Modul schreiben**

`apps/mobile/src/features/sharing/sharedMembers.ts`:

```typescript
import type { SharedMember } from './MembersPage'

/**
 * The members as the screen shows them: whoever is looking comes first,
 * everybody else keeps the order they joined in. Only the position moves —
 * who is admin is a role, not a rank, and stays on the member itself.
 */
export function withViewerFirst(
  members: readonly SharedMember[],
  viewerId: string,
): readonly SharedMember[] {
  const viewer = members.find((member) => member.id === viewerId)
  if (viewer === undefined) return members
  return [viewer, ...members.filter((member) => member.id !== viewerId)]
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test sharedMembers`
Expected: PASS (4 Tests)

- [ ] **Step 5: Im Screen anwenden**

In `MembersPage.tsx` die Map-Quelle ersetzen. Aus

```tsx
        {members.map((member) => {
```

wird

```tsx
        {withViewerFirst(members, currentUserId).map((member) => {
```

plus der Import `import { withViewerFirst } from './sharedMembers'`.

- [ ] **Step 6: Alle Tests + Typen**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit`
Expected: grün

---

### Task 2: Verlassen für jedes Aggregat, nicht nur für Listen

`leaveList` kann heute nur Listen. Rezepte brauchen dasselbe, und `sharing-model.md` verlangt denselben Code — also wandert der Thunk nach `features/sharing/` und bekommt das Aggregat als Parameter. Dafür braucht `recipesSlice` das Gegenstück zu `listLeft`.

**Files:**
- Create: `apps/mobile/src/features/sharing/leaveAggregate.ts`
- Delete: `apps/mobile/src/features/lists/domain/leaveList.ts`
- Modify: `apps/mobile/src/features/recipes/domain/recipesSlice.ts`, `apps/mobile/src/features/recipes/domain/recipesClientStorageHandler.ts`, `apps/mobile/src/features/preferences/domain/preferencesSlice.ts`, `apps/mobile/src/features/lists/overview/ListsPage.tsx`
- Test: `apps/mobile/test/features/recipes/domain/recipesSlice.recipeLeft.test.ts`

**Interfaces:**
- Consumes: `listLeft` (`features/lists/domain/listsSlice`), `removeMember` (`features/sharing/memberCommands`), `selectCurrentUserId`, `selectDeviceId`
- Produces:
  - `recipeLeft({ id: string })` in `recipesSlice` — lokal, kein Sync
  - `leaveAggregate(aggregate: Aggregate): (dispatch, getState) => Promise<void>` in `features/sharing/leaveAggregate.ts`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/recipes/domain/recipesSlice.recipeLeft.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import {
  recipesReducer,
  recipeCreated,
  recipeLeft,
  selectAllRecipes,
} from '@/features/recipes/domain/recipesSlice'
import { aggregateOf } from '@/app/sync/aggregate'

const fold = (actions: readonly { type: string }[]) =>
  actions.reduce(
    (state, action) => recipesReducer(state, action),
    recipesReducer(undefined, { type: '@@INIT' }),
  )

const bolognese = {
  recipeId: 'r1',
  name: 'Bolognese',
  ownerId: 'adnan',
  portions: 4,
  ingredients: [],
  steps: [],
}

describe('leaving a recipe', () => {
  test('drops only the recipe that was left', () => {
    const recipes = fold([
      recipeCreated(bolognese),
      recipeCreated({ ...bolognese, recipeId: 'r2', name: 'Chili' }),
      recipeLeft({ id: 'r1' }),
    ])

    expect(selectAllRecipes({ recipes }).map((recipe) => recipe.id)).toEqual([
      'r2',
    ])
  })

  // Leaving ends access to that log, so the server can never send it back.
  test('never reaches the outbox', () => {
    expect(
      aggregateOf({
        ...recipeLeft({ id: 'r1' }),
        meta: { eventId: 'e1', deviceId: 'd1' },
      }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test recipeLeft`
Expected: FAIL, `recipeLeft` ist kein Export

- [ ] **Step 3: `recipeLeft` im Slice ergänzen**

In `recipesSlice.ts` direkt vor `recipeDeleted` einfügen — Wortlaut und Begründung genau wie bei `listLeft`:

```typescript
    /**
     * Local-only: I left this recipe. The server wrote the member-removed
     * event, but it will never reach me — leaving ends my access to that
     * log. The payload names the id `id` and not `recipeId` on purpose: a
     * `recipeId` at the root would put this into the outbox, where it would
     * be posted to a recipe I am no longer a member of.
     */
    recipeLeft: (
      state: RecipesState,
      action: PayloadAction<{ readonly id: string }>,
    ): RecipesState => ({
      ...state,
      recipes: state.recipes.filter((recipe) => recipe.id !== action.payload.id),
    }),
```

und `recipeLeft` in die Export-Liste von `recipesSlice.actions` aufnehmen.

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test recipeLeft`
Expected: PASS (2 Tests)

- [ ] **Step 5: Mitreagierende Stellen nachziehen**

Ein verlassenes Rezept muss genauso verschwinden wie ein gelöschtes:

In `preferencesSlice.ts` den Import auf `import { recipeDeleted, recipeLeft } from '../../recipes/domain/recipesSlice'` erweitern. Der `recipeDeleted`-Zweig macht seine Arbeit heute inline; er bekommt zuerst denselben Helfer wie die Listen-Seite (neben `withoutList` einfügen):

```typescript
/** Preferences of one recipe, dropped — used when it is deleted or left. */
function withoutRecipe(
  state: PreferencesState,
  recipeId: string,
): PreferencesState {
  return {
    ...state,
    recipePrefs: Object.fromEntries(
      Object.entries(state.recipePrefs).filter(([id]) => id !== recipeId),
    ),
  }
}
```

Der bestehende `recipeDeleted`-Reducer ruft danach `withoutRecipe(state, action.payload.recipeId)`, und daneben kommt der zweite Eintrag:

```typescript
    {
      // Leaving drops the recipe from this device just as deleting does.
      creator: recipeLeft,
      reducer: (
        state: PreferencesState,
        action: PayloadAction<{ readonly id: string }>,
      ): PreferencesState => withoutRecipe(state, action.payload.id),
    },
```

In `recipesClientStorageHandler.ts` die Bedingung erweitern, sonst kehrt das Rezept beim nächsten Start zurück:

```typescript
  if (
    !isEventsConfirmed(action) &&
    !identityAttached.match(action) &&
    !recipeLeft.match(action)
  ) {
    return
  }
```

- [ ] **Step 6: Thunk verallgemeinern**

`apps/mobile/src/features/sharing/leaveAggregate.ts` neu anlegen — Inhalt von `features/lists/domain/leaveList.ts` übernommen und um das Aggregat erweitert:

```typescript
// Leaving something somebody else owns. The counterpart of deleting:
// nothing is destroyed, this device just stops taking part
// (sharing-model.md — a member may always remove themselves).

import type { AppDispatch, RootState } from '../../app/store'
import { selectDeviceId } from '../../app/appSlice'
import type { Aggregate } from '../../app/sync/aggregate'
import { selectCurrentUserId } from '../auth/domain/authSlice'
import { listLeft } from '../lists/domain/listsSlice'
import { recipeLeft } from '../recipes/domain/recipesSlice'
import { removeMember } from './memberCommands'

/**
 * True when the server refuses because it does not count us as a member.
 * Then it is already not ours — a leftover from an identity this device no
 * longer has, or a membership the owner ended. Either way it has no
 * business staying on screen, so this is a success, not a failure.
 */
function alreadyNotAMember(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return message.includes('403') || message.includes('404')
}

/** The local removal of whichever kind was left. */
function leftLocally(aggregate: Aggregate) {
  return aggregate.kind === 'recipe'
    ? recipeLeft({ id: aggregate.id })
    : listLeft({ id: aggregate.id })
}

/**
 * Removes this device's own membership, then drops the aggregate locally.
 *
 * Not optimistic, and not an event: the server owns membership, and once it
 * accepts the removal nobody will ever send this device the matching event —
 * leaving ends access to that log. So the local removal only happens after
 * the server confirmed it. Rejects on failure so the caller can say so.
 */
export const leaveAggregate =
  (aggregate: Aggregate) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const state = getState()
    try {
      await removeMember(aggregate, selectCurrentUserId(state), {
        eventId: crypto.randomUUID(),
        deviceId: selectDeviceId(state),
      })
    } catch (error: unknown) {
      if (!alreadyNotAMember(error)) throw error
    }
    dispatch(leftLocally(aggregate))
  }
```

Danach `features/lists/domain/leaveList.ts` löschen und in `ListsPage.tsx` umstellen:

```tsx
import { leaveAggregate } from '../../sharing/leaveAggregate'
// ...
    void dispatch(leaveAggregate({ kind: 'list', id: target.id })).catch(
      (error: unknown) => {
        console.warn('leaving the list failed', error)
        toast.show('Verlassen fehlgeschlagen')
      },
    )
```

`leftLocally` kennt nur `list` und `recipe`; `plan` fällt bewusst auf `listLeft` zurück, weil es das Aggregat noch nicht gibt — der Tag, an dem es kommt, bringt seinen eigenen Slice mit.

- [ ] **Step 7: Alle Tests + Typen**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit`
Expected: grün

---

### Task 3: Mitglieder per Wischen entfernen, ohne Rückfrage

Das X verschwindet. Entfernt wird durch Wischen, und zwar sofort — es verschwindet nur eine Mitgliedschaft, keine Daten. Damit die Zeile wirklich sofort weg ist, wird das Ergebnis lokal gefaltet, statt auf den Catch-up zu warten.

**Files:**
- Modify: `apps/mobile/src/features/sharing/MembersPage.tsx`
- Test: `apps/mobile/test/features/sharing/removeMemberLocally.test.ts`

**Interfaces:**
- Consumes: `SwipeAction` (`components/SwipeAction`), `fromServer` (`app/fromServer`), `listMemberRemoved`, `recipeMemberRemoved`
- Produces: `memberRemovedLocally(aggregate: Aggregate, memberId: string)` in `features/sharing/memberCommands.ts` — die Action, die die Zeile verschwinden lässt

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/sharing/removeMemberLocally.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { memberRemovedLocally } from '@/features/sharing/memberCommands'
import {
  listsReducer,
  listCreated,
  listMemberAdded,
  selectListMembers,
} from '@/features/lists/domain/listsSlice'
import { needsSync } from '@/app/sync/needsSync'

describe('memberRemovedLocally', () => {
  // The server wrote the event; folding it here is what makes the row go
  // away now instead of one round trip later.
  test('takes the member out of the list', () => {
    const withMember = [
      listCreated({ listId: 'l1', name: 'Einkauf', ownerId: 'adnan' }),
      listMemberAdded({ listId: 'l1', memberId: 'sarah', name: 'Sarah' }),
      memberRemovedLocally({ kind: 'list', id: 'l1' }, 'sarah'),
    ].reduce(
      (state, action) => listsReducer(state, action),
      listsReducer(undefined, { type: '@@INIT' }),
    )

    expect(selectListMembers({ lists: withMember }, 'l1').map((m) => m.id)).toEqual(
      ['adnan'],
    )
  })

  // It is an echo of what the server already did — sending it back would
  // post a member-removed event the client is not allowed to write.
  test('is never sent to the server', () => {
    expect(
      needsSync({
        ...memberRemovedLocally({ kind: 'list', id: 'l1' }, 'sarah'),
        meta: { eventId: 'e1', deviceId: 'd1', remote: true },
      }),
    ).toBe(false)
  })

  test('speaks the recipe event for a recipe', () => {
    expect(memberRemovedLocally({ kind: 'recipe', id: 'r1' }, 'sarah').type).toBe(
      'recipes/recipeMemberRemoved',
    )
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test removeMemberLocally`
Expected: FAIL, `memberRemovedLocally` ist kein Export

- [ ] **Step 3: Action bauen**

Ans Ende von `features/sharing/memberCommands.ts`:

```typescript
/**
 * The member-removed event of whichever kind, marked as coming from the
 * server. Dispatched right after the command succeeded: the server has
 * written this event, but this device would only see it on the next pull —
 * and if it removed itself, never at all. Folding it now is what makes the
 * row disappear immediately; the pull folds the same event again later,
 * which the reducers absorb (they are total).
 */
export function memberRemovedLocally(aggregate: Aggregate, memberId: string) {
  return fromServer(
    aggregate.kind === 'recipe'
      ? recipeMemberRemoved({ recipeId: aggregate.id, memberId })
      : listMemberRemoved({ listId: aggregate.id, memberId }),
  )
}
```

mit den Importen `fromServer` (`../../app/fromServer`), `listMemberRemoved` (`../lists/domain/listsSlice`), `recipeMemberRemoved` (`../recipes/domain/recipesSlice`).

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test removeMemberLocally`
Expected: PASS (3 Tests)

- [ ] **Step 5: X raus, Swipe rein**

In `MembersPage.tsx`:

1. `MemberCard` verliert `onRemove` und den Button; die Prop-Zeile `/** Present only when the viewer may remove this member. */ readonly onRemove: (() => void) | null` und der `{onRemove && (…)}`-Block entfallen ersatzlos, ebenso `RemoveIcon`, falls er sonst nirgends mehr steht.
2. Die Zeile wird beim Rendern gewickelt — nur für Mitglieder, die der Owner entfernen darf:

```tsx
        {withViewerFirst(members, currentUserId).map((member) => {
          const name = memberDisplayName(member, me)
          const isMe = member.id === currentUserId
          const card = (
            <MemberCard
              memberId={member.id}
              name={name}
              role={`${member.isOwner ? 'Admin' : 'Mitglied'}${isMe ? ' · Du' : ''}`}
              isOwnerRole={member.isOwner}
            />
          )

          // Only the owner removes anybody, and never themselves — leaving
          // is a different act and lives on the overview.
          if (!isOwner || isMe) return <div key={member.id}>{card}</div>

          return (
            <SwipeAction
              key={member.id}
              isOpen={openSwipeId === member.id}
              onOpen={() => setOpenSwipeId(member.id)}
              onClose={() => setOpenSwipeId(null)}
              label="Entfernen"
              tone="destructive"
              onTrigger={() => handleRemove(member.id, name)}
            >
              {card}
            </SwipeAction>
          )
        })}
```

3. Der Swipe-Zustand als ephemerer UI-State neben den vorhandenen: `const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)`.
4. `pendingRemoval`, `handleConfirmRemoval` und der zugehörige `DangerConfirmDialog` am Ende der Datei entfallen. An ihre Stelle tritt:

```tsx
  // No confirmation: removing somebody destroys nothing — the aggregate and
  // everything on it stay, that person just stops taking part.
  const handleRemove = (memberId: string, name: string) => {
    setOpenSwipeId(null)
    void removeMember(aggregate, memberId, {
      eventId: crypto.randomUUID(),
      deviceId: selectDeviceId(store.getState()),
    })
      .then(() => {
        store.dispatch(memberRemovedLocally(aggregate, memberId))
        toast.show(`${name} wurde entfernt`)
      })
      .catch((error: unknown) => {
        console.warn('removing the member failed', error)
        toast.show('Entfernen fehlgeschlagen')
      })
  }
```

Der bisherige `await syncEngine.requestSync()` entfällt hier — die Zeile ist schon weg, und der nächste Zyklus holt das Event ohnehin.

- [ ] **Step 6: Manuell prüfen**

Run: `pnpm dev`, Liste mit einem zweiten Mitglied öffnen, Mitglieder-Screen aufrufen.
Expected: Ich stehe oben mit „· Du", der Inhaber trägt „Admin". Wischen auf einer fremden Zeile zeigt „Entfernen"; ein Tap entfernt sofort, ohne Dialog, mit Toast. Auf meiner eigenen Zeile passiert beim Wischen nichts.

- [ ] **Step 7: Alle Tests + Typen**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit`
Expected: grün. **Falls ein bestehender Test rot wird: STOPPEN und melden.**

---

### Task 4: Rückfrage nur noch bei geteilten Listen

Eine Liste, auf der nur ich bin, verschwindet ohne Dialog. Sobald jemand anderes darauf ist, bleibt die Rückfrage — dort verliert nämlich jemand anderes Daten.

**Files:**
- Modify: `apps/mobile/src/features/lists/overview/ListsPage.tsx`
- Test: `apps/mobile/test/features/sharing/needsConfirmation.test.ts`
- Create: `apps/mobile/src/features/sharing/needsConfirmation.ts`

**Interfaces:**
- Produces: `deletionNeedsConfirmation(memberIds: readonly string[]): boolean`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

`apps/mobile/test/features/sharing/needsConfirmation.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { deletionNeedsConfirmation } from '@/features/sharing/needsConfirmation'

describe('deletionNeedsConfirmation', () => {
  // Nobody else loses anything — asking would be a speed bump for nothing.
  test('does not ask for something only I am on', () => {
    expect(deletionNeedsConfirmation(['me'])).toBe(false)
  })

  test('asks as soon as somebody else is on it', () => {
    expect(deletionNeedsConfirmation(['me', 'sarah'])).toBe(true)
  })

  // A list from before members existed carries no ids at all.
  test('does not ask when membership is unknown', () => {
    expect(deletionNeedsConfirmation([])).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd apps/mobile && pnpm test needsConfirmation`
Expected: FAIL, Modul nicht gefunden

- [ ] **Step 3: Regel schreiben**

`apps/mobile/src/features/sharing/needsConfirmation.ts`:

```typescript
/**
 * Whether deleting needs a question first. The rule for the whole app: ask
 * where data disappears for *other people*, nowhere else. Removing a member
 * therefore never asks — it destroys nothing — while deleting something two
 * people share always does.
 */
export function deletionNeedsConfirmation(
  memberIds: readonly string[],
): boolean {
  return memberIds.length > 1
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `cd apps/mobile && pnpm test needsConfirmation`
Expected: PASS (3 Tests)

- [ ] **Step 5: In der Übersicht anwenden**

In `ListsPage.tsx` das View-Model um die Mitgliederzahl erweitern:

```tsx
      isOwn,
      isShared: deletionNeedsConfirmation(list.memberIds),
```

und im Swipe-Handler entscheiden, statt immer den Dialog zu öffnen:

```tsx
            onTrigger={() => {
              setOpenSwipeId(null)
              // Own and private: nothing to weigh up, it just goes.
              if (list.isOwn && !list.isShared) {
                dispatch(listDeleted({ listId: list.id }))
                return
              }
              setPartingTarget({
                id: list.id,
                name: list.name,
                isOwn: list.isOwn,
              })
            }}
```

Der `PartingDialog` bleibt unverändert: Er wird nur noch für geteilte eigene Listen (Löschen) und für fremde Listen (Verlassen) geöffnet.

- [ ] **Step 6: Manuell prüfen**

Run: `pnpm dev`
Expected: Eine frisch angelegte, ungeteilte Liste verschwindet beim Wischen + Tap sofort. Eine geteilte fragt „Liste löschen? … für **alle Mitglieder**". Eine fremde fragt „Liste verlassen?".

- [ ] **Step 7: Alle Tests + Typen**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit`
Expected: grün

---

### Task 5: Rezepte bekommen die Rollen-Logik der Listen

Der Fehler, den die Listen hatten: Ein fremdes Rezept bietet „Löschen" an, obwohl es einem nicht gehört — und der Server nähme es sogar an. Dieser Task überträgt Task 9 des Vorgängerplans eins zu eins auf Rezepte.

**Files:**
- Modify: `apps/mobile/src/features/recipes/overview/RecipesPage.tsx`, `apps/mobile/src/features/recipes/overview/RecipeTile.tsx`, `apps/mobile/src/app/router.ts`

**Interfaces:**
- Consumes: `leaveAggregate` (Task 2), `deletionNeedsConfirmation` (Task 4), `MEMBER_NAME_FALLBACK`
- Produces: `RecipeTile` nimmt zusätzlich `ownerName: string | null`

- [ ] **Step 1: Besitzer auf der Kachel zeigen**

In `RecipeTile.tsx` die Props erweitern:

```tsx
  /**
   * Who this recipe belongs to — null for my own. Named in the meta line so
   * a shared recipe says whose it is before anyone taps it.
   */
  readonly ownerName: string | null
```

und in der Meta-Zeile („4 Portionen · 30 Min") anhängen:

```tsx
  {ownerName !== null && ` · von ${ownerName}`}
```

- [ ] **Step 2: Avatar-Überlapp beheben**

Derselbe Fehler wie in `ListSummaryCard`: `last:mr-0` greift nie, weil der Einladen-Kreis hinter den Avataren steht — der letzte Avatar schiebt sich also unter das Plus. In `RecipeTile.tsx` die gemappten Avatare in einen eigenen Wrapper legen:

```tsx
      {/* Own wrapper so `last:mr-0` really hits the last avatar — with the
          invite circle as a sibling it never did, and the circle ended up
          underneath it. */}
      <span className="flex">
        {members.slice(0, VISIBLE_AVATARS).map((member) => (
          <span
            key={member.id}
            className="border-card -mr-2 flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-bold text-white last:mr-0"
            style={{ backgroundColor: member.color }}
          >
            {member.initial}
          </span>
        ))}
      </span>
```

- [ ] **Step 3: Rolle in der Übersicht auswerten**

In `RecipesPage.tsx` pro Rezept berechnen und an die Kachel geben:

```tsx
            const isOwn = recipe.ownerId === currentUserId
            const isShared = deletionNeedsConfirmation(recipe.memberIds)
            const ownerName = isOwn
              ? null
              : (recipe.memberNames?.[recipe.ownerId] ?? MEMBER_NAME_FALLBACK)
```

Die Wisch-Aktion folgt derselben Regel wie bei Listen:

```tsx
              label={isOwn ? 'Löschen' : 'Verlassen'}
              tone={isOwn ? 'destructive' : 'parting'}
              onTrigger={() => {
                setSwipedRecipeId(null)
                if (isOwn && !isShared) {
                  dispatch(recipeDeleted({ recipeId: recipe.id }))
                  return
                }
                setPartingTarget({ id: recipe.id, name: recipe.name, isOwn })
              }}
```

`pendingDeleteId` wird dabei durch denselben Zustand ersetzt, den `ListsPage` führt. Der Typ wird **lokal wiederholt**, nicht geteilt — er beschreibt den ephemeren Zustand genau dieses Screens, und ein gemeinsamer Ort für zwei Drei-Feld-Typen wäre eine Kopplung ohne Gegenwert:

```tsx
/** A recipe the user asked to get rid of — the verb depends on whose it is. */
type PartingTarget = {
  readonly id: string
  readonly name: string
  readonly isOwn: boolean
}

const [partingTarget, setPartingTarget] = useState<PartingTarget | null>(null)
```

Der bestehende `DangerConfirmDialog` bekommt die zwei Wortlaute:

```tsx
      <DangerConfirmDialog
        open={partingTarget !== null}
        title={partingTarget?.isOwn ? 'Rezept löschen?' : 'Rezept verlassen?'}
        message={
          partingTarget?.isOwn ? (
            <>
              „{partingTarget?.name}" wird für <strong>alle Mitglieder</strong>{' '}
              gelöscht und kann nicht wiederhergestellt werden.
            </>
          ) : (
            <>
              „{partingTarget?.name}" verschwindet von deinem Gerät. Die
              anderen behalten es, und du kannst jederzeit wieder eingeladen
              werden.
            </>
          )
        }
        confirmLabel={partingTarget?.isOwn ? 'Löschen' : 'Verlassen'}
        onConfirm={handleConfirmParting}
        onCancel={() => setPartingTarget(null)}
      />
```

mit

```tsx
  const handleConfirmParting = () => {
    const target = partingTarget
    setPartingTarget(null)
    if (!target) return

    if (target.isOwn) {
      dispatch(recipeDeleted({ recipeId: target.id }))
      return
    }
    void dispatch(leaveAggregate({ kind: 'recipe', id: target.id })).catch(
      (error: unknown) => {
        console.warn('leaving the recipe failed', error)
        toast.show('Verlassen fehlgeschlagen')
      },
    )
  }
```

`useToast` wird dafür in `RecipesPage` eingebunden und `{toast.element}` am Ende gerendert, genau wie in `ListsPage`.

- [ ] **Step 4: Besitzer-Namen für die Rezept-Übersicht laden**

Ohne diesen Schritt steht auf jeder fremden Kachel „von Mitglied". In `router.ts` bekommt `recipesRoute` denselben Loader wie `listsRoute`:

```typescript
  loader: async () => {
    if (!canReachServer()) return
    // The overview names the owner of every shared recipe, and that name
    // has no event to travel in — the owner never triggers a member-added
    // event for themselves. Failing costs the name, not the screen.
    try {
      const projection = await fetchSharingProjection('recipe')
      store.dispatch(
        recipeOwnerNamesLoaded({ ownerNames: projection.ownerNames }),
      )
    } catch (error: unknown) {
      console.warn('reading the recipe projection failed', error)
    }
  },
```

- [ ] **Step 5: Manuell prüfen (zwei Browser-Profile)**

Profil A teilt ein Rezept, Profil B tritt bei.
Expected: B sieht „4 Portionen · von A", wischt „Verlassen", bekommt die Rückfrage und ist danach raus. A sieht sein eigenes, ungeteiltes Rezept ohne Namenszusatz und löscht es ohne Dialog. Avatar und Plus überlappen nirgends.

- [ ] **Step 6: Alle Tests + Typen + Build**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit && pnpm build`
Expected: grün

---

### Task 6: Doku nachziehen

**Files:**
- Modify: `architecture/status.md`, `architecture/sharing-model.md`

- [ ] **Step 1: Verhalten festhalten**

In `architecture/sharing-model.md` einen Abschnitt „Löschen, Verlassen, Entfernen" ergänzen, der die drei Akte gegeneinander abgrenzt und die Regel benennt: *Rückfrage genau dann, wenn Daten für andere verschwinden.* Dazu die Tabelle:

| Akt | Wer darf | Folge | Rückfrage |
|---|---|---|---|
| Löschen | nur der Besitzer | weg für alle, unwiderruflich | nur wenn geteilt |
| Verlassen | jedes Mitglied | weg nur bei mir, Rückkehr nur per neuer Einladung | ja |
| Entfernen | nur der Besitzer | das Mitglied verliert den Zugang, Daten bleiben | nein |

In `architecture/status.md` den Absatz zur Listen-Übersicht um die Rollen-Logik ergänzen und vermerken, dass Rezepte dieselbe hat.

- [ ] **Step 2: Die offene Server-Lücke festhalten**

In `architecture/status.md` unter „Offen" ergänzen: `lists/listDeleted` und `recipes/recipeDeleted` laufen weiterhin über den generischen Klasse-1-Pfad, der **jedem Mitglied** das Anhängen erlaubt. Die Oberfläche bietet Nicht-Besitzern kein Löschen mehr an, erzwungen ist es aber erst, wenn Löschen ein Klasse-2-Command mit eigenem Endpunkt wird.

---

### Task 7: Freundesliste ohne Rückfrage *(nur falls gewünscht — siehe „Offene Entscheidungen")*

**Files:**
- Modify: `apps/mobile/src/features/friends/FriendsPage.tsx`

- [ ] **Step 1: Dialog entfernen**

Das Entfernen eines Freundes löscht nur meinen eigenen Adressbuch-Eintrag — die Gegenseite behält ihren, gemeinsame Listen bleiben. Nach der Regel aus Task 4 fällt die Rückfrage weg:

```tsx
              onTrigger={() => {
                setOpenSwipeId(null)
                dispatch(friendRemoved({ friendId: friend.id }))
                removeFriend(friend.id).catch((error: unknown) => {
                  console.warn('removing the friend failed', error)
                  toast.show('Entfernen fehlgeschlagen')
                })
              }}
```

`pendingRemoval`, `handleConfirmRemoval` und der `DangerConfirmDialog` entfallen.

- [ ] **Step 2: Alle Tests + Typen**

Run: `cd apps/mobile && pnpm test && pnpm tsc --noEmit`
Expected: grün

---

## Was dieser Plan bewusst nicht tut

- **Kein Undo-Toast.** Verworfen (2026-08-03): Statt rückgängig zu machen, wird nur dort gefragt, wo es andere trifft.
- **Kein Papierkorb.** Wäre der Weg, die letzte Rückfrage loszuwerden (Listonic macht das so) — ein Feature für später, kein Detail.
- **Kein Swipe auf Einkaufs-Items.** Dort ist die Kachel die Abhak-Fläche; eine zweite Bedeutung für dieselbe Geste würde sich mit dem Scrollen im Grid schlagen. Entfernt wird weiterhin über das Detail-Sheet.
- **Kein Besitzwechsel.** „Verlassen" ist für den Besitzer nicht möglich; er löscht oder bleibt. Ownership-Transfer ist ein eigenes Thema.
