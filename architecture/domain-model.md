# Domain Model — ShopZebra

Dieses Dokument definiert das Domain Model, die Datei-Organisation und die Kompositions-Regeln für die gesamte App. Es ist die verbindliche Referenz für die Implementierung.

---

## 1. Zwei State-Schichten mit verschiedenem Lifecycle

State in ShopZebra zerfällt in zwei unabhängige Konzepte. Sie zu trennen ist De-Complecting: verschiedener Lifecycle, verschiedene Quelle, verschiedener Speicher → gehört nicht in denselben Type.

| | Domain State | Local Preferences |
|---|---|---|
| **Was** | Die geteilte Wahrheit der Familie | Wie Dinge für DIESEN User aussehen |
| **Beispiele** | Listenname, Items, Members, Rezepte | Farben, Emoji, Theme |
| **Quelle** | Events (Backend → alle Clients) | Capacitor Preferences (lokal) |
| **Sync** | Ja — alle Familienmitglieder sehen dasselbe | Nein — pro User, pro Gerät |
| **Gespeichert** | DynamoDB Events Table | Lokaler Speicher |

**Der Test:** Wenn Mama einen Wert ändert und Papa sieht die Änderung → Domain. Wenn Mama einen Wert ändert und nur sie sieht ihn → Local Preference.

**Konsequenz:** `color` und `emoji` einer Liste sind **Local Preferences**, nicht Domain. Sie tauchen nie in Events auf, nie im Backend, nie auf einem anderen Gerät. `name` und `memberIds` einer Liste sind Domain — sie werden gesynct.

---

## 2. Domain Aggregates und ihre Events

Jedes Aggregate ist eine Konsistenzgrenze. Events gehören zu genau einem Aggregate. Aggregates referenzieren sich gegenseitig **nur per ID** — nie durch eingebettete Objekte.

### Family

Die Familie als Einheit. Wer gehört dazu, wer darf was.

```
Entity: FamilyMember { id, name, email, role }

Events:
  familyCreated        { familyId, name, createdBy }
  memberInvited        { email, role, invitedBy }
  memberJoined         { memberId, name, email }
  memberRemoved        { memberId }
  preferencesUpdated   { memberId, dietary: [...] }
  messageSent          { messageId, text, sentBy }
  reactionAdded        { targetEventId, emoji, reactedBy }
```

### ShoppingList

Eine Einkaufsliste mit Items. Items existieren nicht ohne Liste — sie sind Teil des Aggregates.

```
Entity: ShoppingList { id, name, memberIds }
Entity: ListItem     { id, name, quantity, unit, category, checked, addedBy, parentId?, note? }

Events:
  listCreated          { listId, name, createdBy }
  listRenamed          { listId, name }
  listDeleted          { listId }
  listMemberAdded      { listId, memberId }
  listMemberRemoved    { listId, memberId }
  itemAdded            { listId, itemId, name, quantity, unit, category, addedBy, parentId? }
  itemChecked          { listId, itemId, checkedBy }
  itemUnchecked        { listId, itemId }
  itemRemoved          { listId, itemId }
  itemUpdated          { listId, itemId, quantity?, name? }
  itemNoteUpdated      { listId, itemId, note }
  customVariantAdded   { listId, productId, variantName }
```

**Wichtig:** Kein `color`, kein `emoji` in Events. Die sind Local Preferences.

#### Varianten-Modell

Produkte können Varianten haben (z.B. Äpfel → Elstar, Braeburn, Gala). Varianten sind eigenständige Items mit Rückverweis auf das Eltern-Produkt.

```
Beispiel: User fügt "Elstar" und "Granny Smith" zur Liste hinzu

Items im Store:
  { id: "apples--Elstar",       parentId: "apples", name: "Elstar",       qty: 2, ... }
  { id: "apples--Granny Smith", parentId: "apples", name: "Granny Smith", qty: 1, ... }

ID-Konvention:
  Generisches Produkt:  id = productId              (z.B. "apples")
  Variante:             id = productId--variantName  (z.B. "apples--Elstar")
  parentId vorhanden → ist Variante, parentId = productId

Gruppierung in der UI:
  parentId || id  → Key für Gruppierung auf der Einkaufsliste
  Tile zeigt Eltern-Name, Status-Line zeigt "2 Sorten" oder Variantenname
```

Custom Variants (`customVariantAdded`) erweitern den Produktkatalog um benutzerdefinierte Sorten. Der Event lebt auf dem ShoppingList-Aggregate weil er im Kontext einer Liste entsteht.

#### Emoji-Handling

Emoji ist **nicht Teil des Items**. Emoji wird zur Renderzeit abgeleitet:

```
emoji = emojiOverrides[item.parentId ?? item.id] ?? PRODUCT_CATALOG[item.parentId ?? item.id].emoji
```

- **Produktkatalog** — statische Referenzdaten, bei jedem Client identisch (wie eine Länderliste). Definiert Default-Emojis.
- **Emoji-Overrides** — Local Preferences. User ändert Emoji für "Äpfel" von 🍎 zu 🍏, nur auf seinem Gerät.

### Recipe

Ein Rezept mit Zutaten. Zutaten existieren nicht ohne Rezept.

```
Entity: Recipe     { id, name, portions, instructions }
Entity: Ingredient { name, quantity, unit }

Events:
  recipeCreated        { recipeId, name, portions, ingredients[], instructions }
  recipeUpdated        { recipeId, ... }
  recipeDeleted        { recipeId }
```

### WeekPlan

Wochenplan einer Familie. Ordnet Rezepte Wochentagen zu.

```
Entity: WeekPlan { familyId, week, year, slots[] }
Entity: DaySlot  { dayOfWeek, recipeId }

Events:
  recipeAssigned       { familyId, week, year, dayOfWeek, recipeId }
  recipeUnassigned     { familyId, week, year, dayOfWeek }
```

### Activity (Read Model)

Activity ist **kein Aggregate**. Es ist eine Projektion über Events aller Aggregates — der Activity Feed ist gratis weil wir Event Sourcing machen. Eigene Events (Nachrichten, Reaktionen) leben auf dem Family-Aggregate.

---

## 3. Local Preferences

Lokale UI-Praferenzen: pro User, pro Gerät, nie gesynct. Eigener Slice, eigener Speicher (Capacitor Preferences).

```
Per Liste:      { [listId]: { color: ListColor, emoji: string } }
Per Member:     { [memberId]: { color: string } }
Per Produkt:    { [productId]: { emoji: string } }      ← Emoji-Overrides
App-weit:       { theme: 'dark' | 'light' }
```

**Defaults:** Wenn ein User noch keine Preference gesetzt hat, wird ein Default deterministisch aus der ID abgeleitet. Kein leerer State, kein Null-Check.

**Emoji-Overrides vs. Domain:** Wenn Mama das Äpfel-Emoji von 🍎 zu 🍏 ändert, sieht nur sie das. Das ist eine visuelle Präferenz, kein geteilter Fakt. Der Produktkatalog (statische Referenzdaten) liefert den Default.

---

## 4. Datei-Organisation

### Prinzip: Domain-Types leben in eigenen Dateien

Jedes Feature hat eine `*Domain.ts`-Datei die **nur die Domain-Types** enthält — keine Logik, keine Actions, kein Reducer. Der Slice importiert daraus. Das trennt "was ist eine ShoppingList?" (Domain-Beschreibung) von "wie wird der State verwaltet?" (Slice-Logik).

### Verzeichnisstruktur

```
features/
  family/
    state/
      familyDomain.ts          ← type FamilyMember (nur Types)
      familySlice.ts           ← Reducer, Actions, Selektoren (importiert aus familyDomain)
      familySync.ts            ← Sync-Handler
    FamilySettingsPage.tsx
    InviteMemberSheet.tsx

  lists/
    state/
      listsDomain.ts           ← type ShoppingList (nur Types)
      listsSlice.ts            ← Reducer, Actions, Selektoren
      listsSync.ts             ← Sync-Handler
      listsPageSelector.ts     ← Composed Selector für ListsPage (siehe Abschnitt 5)
    ListsPage.tsx
    ListTile.tsx
    ListsHeader.tsx
    SummaryChips.tsx

  manage-list/
    CreateListPage.tsx
    EditListPage.tsx
    ListEditor.tsx

  shopping/
    state/
      shoppingDomain.ts        ← type ListItem (nur Types)
      shoppingSlice.ts
      shoppingSync.ts
    ShoppingListPage.tsx
    CategorySection.tsx
    ItemTile.tsx

  recipes/
    state/
      recipesDomain.ts         ← type Recipe, Ingredient (nur Types)
      recipesSlice.ts
      recipesSync.ts
    RecipesPage.tsx
    RecipeDetailPage.tsx

  meal-plan/
    state/
      mealPlanDomain.ts        ← type WeekPlan, DaySlot (nur Types)
      mealPlanSlice.ts
      mealPlanSync.ts
    WeekPlanPage.tsx

  activity/
    state/
      activitySlice.ts         ← Read Model, rohe Events
    ActivityPage.tsx

  preferences/
    state/
      preferencesDomain.ts     ← type ListPreferences, MemberPreferences (nur Types)
      preferencesSlice.ts
    Gespeichert in Capacitor Preferences, nie gesynct
```

### Domain-Dateien: Was rein kommt und was nicht

Eine `*Domain.ts`-Datei enthält **ausschließlich Type-Definitionen**:

```ts
// lists/state/listsDomain.ts
export type ShoppingList = {
  readonly id: string
  readonly name: string
  readonly memberIds: readonly string[]
}
```

**Nicht** in der Domain-Datei: Reducer, Actions, Selektoren, Imports aus anderen Features, Logik jeder Art.

Der Slice importiert den Type:

```ts
// lists/state/listsSlice.ts
import type { ShoppingList } from './listsDomain'

type ListsState = {
  readonly lists: readonly ShoppingList[]
}
// Reducer, Actions, Selektoren...
```

### Alle Domain-Types im Überblick

**Domain (gesynct):**

```ts
// family/state/familyDomain.ts
type FamilyMember = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: 'admin' | 'member'
}

// lists/state/listsDomain.ts
type ShoppingList = {
  readonly id: string
  readonly name: string
  readonly memberIds: readonly string[]
}

// shopping/state/shoppingDomain.ts
type ListItem = {
  readonly id: string           // productId oder productId--variantName
  readonly name: string
  readonly quantity: number
  readonly unit: string
  readonly category: string
  readonly checked: boolean
  readonly addedBy: string      // memberId — Referenz per ID
  readonly parentId?: string    // productId — nur bei Varianten
  readonly note?: string
}

// recipes/state/recipesDomain.ts
type Recipe = {
  readonly id: string
  readonly name: string
  readonly portions: number
  readonly ingredients: readonly Ingredient[]
  readonly instructions: string
}
type Ingredient = {
  readonly name: string
  readonly quantity: string
  readonly unit: string
}

// meal-plan/state/mealPlanDomain.ts
type WeekPlan = {
  readonly familyId: string
  readonly week: number
  readonly year: number
  readonly slots: readonly DaySlot[]
}
type DaySlot = {
  readonly dayOfWeek: number
  readonly recipeId: string   // Referenz per ID
}
```

Kein `color`. Kein `emoji` auf Items oder Listen. Kein `itemCount`. Kein `badge`. Reine Domain. Emoji wird zur Renderzeit aus Produktkatalog + lokalen Overrides abgeleitet.

**Local Preferences (nicht gesynct):**

```ts
// preferences/state/preferencesDomain.ts
type ListPreferences = {
  readonly color: ListColor
  readonly emoji: string
}

type MemberPreferences = {
  readonly color: string
}

type ProductPreferences = {
  readonly emoji: string
}

type PreferencesState = {
  readonly listPrefs: { readonly [listId: string]: ListPreferences }
  readonly memberPrefs: { readonly [memberId: string]: MemberPreferences }
  readonly productPrefs: { readonly [productId: string]: ProductPreferences }
  readonly theme: 'dark' | 'light'
}
```

---

## 5. Komposition: Signal Graph + Pages + Komponenten

### Das Problem

Aggregates referenzieren sich nur per ID. Irgendwo müssen die IDs aufgelöst werden. Zwei Risiken:

1. **Coupling:** Wenn Komponenten Selektoren aus fremden Features importieren, kennt jedes Feature alle anderen.
2. **Complecting:** Wenn die Page Datenquellen wählt, zusammensetzt UND rendert, verwebt sie drei Konzepte.

### Die Lösung: Vier Schichten, jede macht eins

Inspiriert von Re-frame's Signal Graph. `createSelector` IST der Signal Graph — wir nutzen ihn für die Cross-Feature-Komposition.

**Schicht 1 — Feature-Selektoren** (Public API jedes Features, leben im Slice):
```ts
// lists/state/listsSlice.ts — liest nur aus eigenem Slice
export const selectAllLists = (state: RootState) => state.lists.lists

// family/state/familySlice.ts
export const selectAllMembersById = (state: RootState) => state.family.membersById

// preferences/state/preferencesSlice.ts
export const selectAllListPreferences = (state: RootState) => state.preferences.listPrefs
```

**Schicht 2 — Composed Selectors** (Signal Graph, pure Funktionen, leben neben der Page die sie braucht):
```ts
// lists/state/listsPageSelector.ts — pure Funktion, kein React
import { createSelector } from '@reduxjs/toolkit'
import { selectAllLists } from './listsSlice'
import { selectAllMembersById } from '../../family/state/familySlice'
import { selectAllListPreferences, selectAllMemberPreferences } from '../../preferences/state/preferencesSlice'

export const selectListsPageData = createSelector(
  [selectAllLists, selectAllMembersById, selectAllListPreferences, selectAllMemberPreferences],
  (lists, membersById, listPrefs, memberPrefs) =>
    lists.map(list => ({
      id: list.id,
      name: list.name,
      color: listPrefs[list.id]?.color ?? defaultColor(list.id),
      emoji: listPrefs[list.id]?.emoji ?? '🛒',
      avatars: list.memberIds.map(id => ({
        letter: membersById[id]?.name[0] ?? '?',
        color: memberPrefs[id]?.color ?? defaultMemberColor(id),
      })),
    }))
)
```

**Hier lebt die Cross-Feature-Coupling.** In einer puren, testbaren, memoized Funktion. Nicht in React-Komponenten.

**Schicht 3 — Pages** (UI-Orchestrierung, ein Selektor-Aufruf):
```tsx
// lists/ListsPage.tsx — EIN Selektor, dann Rendering
function ListsPage() {
  const lists = useAppSelector(selectListsPageData)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const dispatch = useAppDispatch()

  return lists.map(list => <ListTile key={list.id} {...list} />)
}
```

Die Page wählt keine Datenquellen, setzt keine Daten zusammen. Sie ruft einen Composed Selector auf und rendert. Ephemerer UI-State (welches Swipe-Menü ist offen, welcher Dialog) bleibt in der Page als `useState`.

**Schicht 4 — Komponenten** (Props → JSX):
```tsx
// lists/ListTile.tsx — kein useSelector, kein useDispatch, nur Props
function ListTile({ name, color, emoji, avatars }: ListTileProps) {
  return (...)
}
```

### Zusammenfassung der Schichten

| Schicht | Verantwortung | Kennt andere Features? | Pure? |
|---|---|---|---|
| Feature-Selektoren | Daten aus eigenem Slice lesen | Nein | Ja |
| Composed Selectors | Daten aus mehreren Features zusammensetzen | Ja — das ist ihre Aufgabe | Ja |
| Pages | UI-State + Dispatch + Rendering | Nein — nur den Composed Selector | Nein (React) |
| Komponenten | Props → JSX | Nein | Ja (fast) |

### Re-frame-Mapping

```
Re-frame:                          Unser Äquivalent:
app-db                             Redux Store
  → reg-sub :all-lists               → selectAllLists (Feature-Selektor)
  → reg-sub :members-by-id           → selectAllMembersById (Feature-Selektor)
  → reg-sub :lists-for-display       → selectListsPageData (Composed Selector)
  → view: @(subscribe [...])         → useAppSelector(selectListsPageData)
```

---

## 6. Import-Regeln

Diese Regeln verhindern unkontrollierte Coupling zwischen Features:

1. **`*Domain.ts`** importiert **nichts**. Nur Type-Definitionen, keine Abhängigkeiten.
2. **`*Slice.ts`** importiert **nur aus der eigenen `*Domain.ts`**. Kein Import aus anderen Features.
3. **`*Sync.ts`** importiert aus dem **eigenen Slice** (Action Creators, Types) und aus der **eigenen API-Datei**.
4. **Composed Selectors** (`*PageSelector.ts`) importieren **Feature-Selektoren aus beliebigen Slices**. Das ist die einzige Stelle für Cross-Feature-Imports.
5. **Pages** importieren aus dem **eigenen Feature** (Komponenten, Composed Selector) und aus `app/` (useAppSelector, useAppDispatch).
6. **Komponenten** importieren **nichts aus `state/`**. Keine Selektoren, keine Actions, keine Domain-Types anderer Features. Nur Props und `ui/`-Primitives.

```
Erlaubte Imports:
  *Domain.ts       → nichts
  *Slice.ts        → eigene *Domain.ts
  *Sync.ts         → eigener *Slice.ts, eigene *Api.ts
  *PageSelector.ts → beliebige Feature-Selektoren (Cross-Feature-Coupling)
  *Page.tsx        → eigene *PageSelector.ts, eigene Komponenten, app/hooks
  *.tsx            → eigene Props, ui/-Primitives
```

---

## 7. Cross-Aggregate-Kommunikation

Aggregates kennen sich nicht. Kommunikation läuft über Redux Actions.

**MealPlan → ShoppingList** (Zutaten auf Liste schieben):
```
meal-plan/ dispatcht:
  ingredientsCheckedOut { listId, ingredients: [{ name, quantity, unit }] }

shopping/ Reducer reagiert:
  → erstellt ListItems mit eigener ID und Kategorie

meal-plan/ importiert nichts aus shopping/.
Der Payload ist plain data, keine fremden Types.
```

**Offline → Online:**
```
1. App kommt online
2. GET /sync?since=lastSyncTimestamp
3. Für jedes Event: dispatch(fromServer(action))
4. Jeder Reducer verarbeitet "seine" Events, ignoriert den Rest
5. preferencesSlice ist nicht betroffen — hat keine Events
```

**Voraussetzung:** Referenzierte Daten müssen im Store sein. `family/`-Slice lädt Members beim App-Start (Route-Loader oder App-Init). Danach sind sie da und jeder Selektor kann darauf zugreifen.

---

## 8. Backend: Event Store

Das Backend ist ein dummer Event Store + Broadcaster. Keine Business-Logik.

### Events Table (die Wahrheit)

```
PK: aggregateId    (z.B. LIST#abc, FAMILY#xyz, RECIPE#123, PLAN#fam1#2026-W09)
SK: timestamp#eventId

Attributes: type, payload, userId, familyId

GSI: familyId + timestamp
  → "alle Events dieser Familie seit T"
  → Offline-Sync, Activity Feed
```

### State Table (Optimierung)

```
PK: aggregateId
Attributes: state (materialisierter JSON), version

Aktualisiert durch DynamoDB Stream → Lambda Stream Processor.
Existiert damit neue Geräte nicht alle Events replayed müssen.
```

### API

```
POST  /lists/{id}/events       → Event validieren, speichern, auf AppSync publishen
GET   /lists/{id}/events       → Events seit ?since=t
GET   /lists/{id}              → Materialisierten State
GET   /sync?since=t            → Alle Family-Events seit t (GSI-Query)
POST  /family/invite           → Einladung senden
```

Analog für `/recipes/{id}/events` und `/plans/{id}/events`.

### Wire Format

```json
{ "type": "shopping/itemAdded", "payload": {
    "listId": "abc", "itemId": "apples--Elstar", "parentId": "apples",
    "name": "Elstar", "quantity": 1, "unit": "kg",
    "category": "fruits-vegetables", "addedBy": "user-1"
}}

{ "type": "shopping/itemChecked", "payload": { "listId": "abc", "itemId": "apples--Elstar", "checkedBy": "user-1" } }

{ "type": "shopping/itemNoteUpdated", "payload": { "listId": "abc", "itemId": "apples", "note": "nur Bio" } }

{ "type": "shopping/customVariantAdded", "payload": { "listId": "abc", "productId": "apples", "variantName": "Honeycrisp" } }
```

Dasselbe Objekt ist Redux Action, Domain Event und Wire Format. Kein Mapping, kein Serialisierungslayer. Ein Konzept durchgehend.

---

## 9. Statische Referenzdaten: Produktkatalog

Der Produktkatalog ist **kein Domain State** und **keine Local Preference**. Er ist statische Referenzdaten — bei jedem Client identisch, wie eine Länderliste oder Währungstabelle.

```
Produkt:  { id, emoji, name, unit, category, variants?: string[] }

Beispiel:
  { id: "apples", emoji: "🍎", name: "Äpfel", unit: "kg", category: "fruits-vegetables",
    variants: ["Elstar", "Braeburn", "Gala", "Granny Smith", "Pink Lady"] }
```

- Lebt im Code, nicht in der Datenbank
- Wird bei App-Updates erweitert (neue Produkte, neue Kategorien)
- Custom Variants (`customVariantAdded`) erweitern den Katalog zur Laufzeit pro Liste — das ist Domain

---

## 10. Offene Entscheidungen

- **itemCount**: Woher kennt die Listen-Übersicht die Anzahl Items? Optionen: (a) Backend liefert es im materialisierten State, (b) lists/-Reducer zählt mit wenn itemAdded/itemRemoved Events kommen, (c) Selektor der aus shopping/ liest (nur für offene Liste). Vermutlich (b).
- **Dietary Preferences**: Leben auf dem Family-Aggregate (preferencesUpdated Event). Könnten auch Local Preference sein wenn sie nicht geteilt werden sollen — z.B. "Papa ist laktoseintolerant" sollte die ganze Familie wissen → Domain.
- **Custom Variants Scope**: Aktuell auf ShoppingList-Aggregate (pro Liste). Alternativ: auf Family-Aggregate (familyweit, alle Listen sehen dieselben Custom Variants). Pro Liste ist einfacher, familyweit ist nützlicher. Kann später migriert werden.
