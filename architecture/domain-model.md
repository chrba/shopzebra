# Domain Model — ShopZebra

Dieses Dokument definiert das Domain Model, die Datei-Organisation und die Kompositions-Regeln für die gesamte App. Es ist die verbindliche Referenz für die Implementierung.

---

## 1. Zwei State-Schichten mit verschiedenem Lifecycle

State in ShopZebra zerfällt in zwei unabhängige Konzepte. Sie zu trennen ist De-Complecting: verschiedener Lifecycle, verschiedene Quelle, verschiedener Speicher → gehört nicht in denselben Type.

| | Domain State | Local Preferences |
|---|---|---|
| **Was** | Die geteilte Wahrheit der Listen-Mitglieder | Wie Dinge für DIESEN User aussehen |
| **Beispiele** | Listenname, Items, Members, Rezepte | Farben, Emoji, Theme |
| **Quelle** | Events (Backend → alle Clients) | Capacitor Preferences (lokal) |
| **Sync** | Ja — alle Listen-Mitglieder sehen dasselbe | Nein — pro User, pro Gerät |
| **Gespeichert** | DynamoDB Events Table | Lokaler Speicher |

**Der Test:** Wenn Mama einen Wert ändert und Papa sieht die Änderung → Domain. Wenn Mama einen Wert ändert und nur sie sieht ihn → Local Preference.

**Konsequenz:** `color` und `emoji` einer Liste sind **Local Preferences**, nicht Domain. Sie tauchen nie in Events auf, nie im Backend, nie auf einem anderen Gerät. `name` und `memberIds` einer Liste sind Domain — sie werden gesynct.

---

## 2. Domain Aggregates und ihre Events

Jedes Aggregate ist eine Konsistenzgrenze. Events gehören zu genau einem Aggregate. Aggregates referenzieren sich gegenseitig **nur per ID** — nie durch eingebettete Objekte.

### Kein Family-Aggregate (entschieden 2026-07-25)

**Es gibt kein Familien-Konzept.** Die Einheit von Zugriff und Kollaboration ist die **Liste**: Sie hat einen **Owner** (ihren Ersteller); nur er erzeugt Invites und entfernt Mitglieder, jedes Mitglied kann sich selbst entfernen. Mitglieder-Anzeigedaten (Name) kommen aus dem server-geschriebenen `listMemberAdded`-Event. Nachrichten und Reaktionen leben auf dem ShoppingList-Aggregate. Offen: Ernährungspräferenzen und geteilte Wochenpläne ([status.md](./status.md) §7).

### ShoppingList

Eine Einkaufsliste mit Items. Items existieren nicht ohne Liste — sie sind Teil des Aggregates.

```
Entity: ShoppingList { id, name, ownerId, memberIds }
Entity: ListItem     { id, name, quantity, unit, category, checked, addedBy, parentId?, note? }
Entity: ListMember   { id, name }

Events:
  listCreated          { listId, name, createdBy }        ← createdBy = Owner
  listRenamed          { listId, name }
  listDeleted          { listId }
  listMemberAdded      { listId, memberId, name }
  listMemberRemoved    { listId, memberId }
  messageSent          { listId, messageId, text, sentBy }
  reactionAdded        { listId, targetEventId, emoji, reactedBy }
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

Wochenplan eines Users (nach Wegfall des Familien-Konzepts user-scoped; Teilen offen, siehe [status.md](./status.md) §7). Ordnet Rezepte Wochentagen zu.

```
Entity: WeekPlan { userId, week, year, slots[] }
Entity: DaySlot  { dayOfWeek, recipeId }

Events:
  recipeAssigned       { week, year, dayOfWeek, recipeId }
  recipeUnassigned     { week, year, dayOfWeek }
```

### Activity (Read Model)

Activity ist **kein Aggregate**. Es ist eine Projektion über Events — **pro Liste**, über deren Log. Eigene Events (Nachrichten, Reaktionen) leben auf dem ShoppingList-Aggregate.

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

Verbindlich ist die **Bounded-Context-Struktur** aus [refactoring.md](./refactoring.md) (entschieden 2026-07-25): pro Feature ein `domain/`-Subfolder (Types, Slice, Handler — kein UI-Code) plus UI-Aspekte mit Business-Namen.

```
features/
  lists/
    domain/
      listsDomain.ts           ← type ShoppingList (nur Types)
      listsSlice.ts            ← Reducer, Actions, Selektoren
      listsSync.ts             ← Sync-Handler
    overview/
      ListsPage.tsx
      ListTile.tsx
      ListsHeader.tsx
      SummaryChips.tsx
      listsPageSelector.ts     ← Composed Selector für ListsPage (siehe Abschnitt 5)
    manage/
      CreateListPage.tsx
      EditListPage.tsx
      ListEditor.tsx

  shopping/
    domain/
      shoppingDomain.ts        ← type ListItem (nur Types)
      shoppingSlice.ts
      shoppingSync.ts
    list-view/
      ShoppingListPage.tsx
      CategorySection.tsx
      ItemTile.tsx

  recipes/
    domain/
      recipesDomain.ts         ← type Recipe, Ingredient (nur Types)
      recipesSlice.ts
      recipesSync.ts
    catalog/
      RecipesPage.tsx
    detail/
      RecipeDetailPage.tsx

  meal-plan/
    domain/
      mealPlanDomain.ts        ← type WeekPlan, DaySlot (nur Types)
      mealPlanSlice.ts
      mealPlanSync.ts
    weekly/
      WeekPlanPage.tsx

  activity/
    domain/
      activitySlice.ts         ← Read Model, rohe Events
    feed/
      ActivityPage.tsx

  auth/
    domain/                    ← authSlice, authThunks
    profile/
      ProfilePage.tsx          ← Profil gehört zur User-Identität

  preferences/
    domain/
      preferencesDomain.ts     ← type ListPreferences, MemberPreferences (nur Types)
      preferencesSlice.ts
    Gespeichert in Capacitor Preferences, nie gesynct
```

Composed Selectors leben beim UI-Aspekt, der sie braucht — nicht in `domain/`. Import-Regeln: UI darf aus jeder `domain/` importieren; `domain/` importiert nie UI; UI importiert nie fremde UI ([refactoring.md](./refactoring.md)).

### Domain-Dateien: Was rein kommt und was nicht

Eine `*Domain.ts`-Datei enthält **ausschließlich Type-Definitionen**:

```ts
// lists/domain/listsDomain.ts
export type ShoppingList = {
  readonly id: string
  readonly name: string
  readonly ownerId: string
  readonly memberIds: readonly string[]
}
```

**Nicht** in der Domain-Datei: Reducer, Actions, Selektoren, Imports aus anderen Features, Logik jeder Art.

Der Slice importiert den Type:

```ts
// lists/domain/listsSlice.ts
import type { ShoppingList } from './listsDomain'

type ListsState = {
  readonly lists: readonly ShoppingList[]
}
// Reducer, Actions, Selektoren...
```

### Alle Domain-Types im Überblick

**Domain (gesynct):**

```ts
// lists/domain/listsDomain.ts
type ShoppingList = {
  readonly id: string
  readonly name: string
  readonly ownerId: string
  readonly memberIds: readonly string[]
}
type ListMember = {
  readonly id: string
  readonly name: string   // aus listMemberAdded, server-angereichert
}

// shopping/domain/shoppingDomain.ts
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

// recipes/domain/recipesDomain.ts
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

// meal-plan/domain/mealPlanDomain.ts
type WeekPlan = {
  readonly userId: string
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
// preferences/domain/preferencesDomain.ts
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
// lists/domain/listsSlice.ts — liest nur aus eigenem Slice
export const selectAllLists = (state: RootState) => state.lists.lists

// lists/domain/listsSlice.ts — Members leben in der lists-Domain
export const selectAllMembersById = (state: RootState) => state.lists.membersById

// preferences/domain/preferencesSlice.ts
export const selectAllListPreferences = (state: RootState) => state.preferences.listPrefs
```

**Schicht 2 — Composed Selectors** (Signal Graph, pure Funktionen, leben neben der Page die sie braucht):
```ts
// lists/overview/listsPageSelector.ts — pure Funktion, kein React
import { createSelector } from '@reduxjs/toolkit'
import { selectAllLists, selectAllMembersById } from '../domain/listsSlice'
import { selectAllListPreferences, selectAllMemberPreferences } from '../../preferences/domain/preferencesSlice'

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
6. **Komponenten** importieren **nichts aus `domain/`**. Keine Selektoren, keine Actions, keine Domain-Types anderer Features. Nur Props und `ui/`-Primitives.

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

Das Event landet im Log des **ShoppingList-Aggregates** (`LIST#{listId}`) und ist damit ganz normal gesynct — für die Sync-Engine ist das Ziel-Aggregate maßgeblich, nicht das dispatchende Feature. Siehe [../services/events.md](../services/events.md).

**Offline → Online:**
```
1. App kommt online
2. Pro Liste: GET /lists/{id}/events?since=<letzte bestätigte Position dieser Liste>
3. Eingehende Events nach Position sortieren, in den bestätigten State falten
4. Eigene Pending-Events obendrauf replayen (Rebase)
5. Pending-Events an den Server senden
6. Jeder Reducer verarbeitet "seine" Events, ignoriert den Rest
7. preferencesSlice ist nicht betroffen — hat keine Events
```
Ablauf und Bausteine: [sync-engine.md](./sync-engine.md).

**Voraussetzung:** Referenzierte Daten müssen im Store sein. Die Members einer Liste entstehen im lists-Reducer aus server-geschriebenen `listMemberAdded`-Events — nach dem Sync sind sie da und jeder Selektor kann darauf zugreifen.

---

## 8. Backend: Event Store

Das Backend ist ein dummer Event Store + Broadcaster. Keine Business-Logik.

### Events Table (die Wahrheit)

```
PK: aggregateId    (z.B. LIST#abc, RECIPE#123, PLAN#user1#2026-W09)
SK: EVT#<position> (zero-padded Sequenznummer, vom Server vergeben)

Attributes: type, payload (opak), userId, eventId, deviceId
```

Kein `familyId`, kein Family-GSI. Der Cursor ist **pro Aggregate** (Positionen sind je Log vergeben); der Client holt pro Liste nach. Welche Listen er hat, liefert `GET /lists` aus der Membership-Projektion. Der Activity Feed ist eine Projektion pro Liste.

Die Position — eine pro Aggregate strikt aufsteigende, lückenlose Sequenznummer — ist gleichzeitig Sortierschlüssel und **kanonische Reihenfolge** für die Konfliktauflösung. Keine Uhr geht in den Sortierschlüssel ein; die Server-Empfangszeit liegt als Attribut `appendedAt` im Event.

### Snapshot Table (Optimierung)

```
PK: aggregateId
Attributes: snapshot (opakes JSON), upToPosition
```

Erzeugt vom **Client**, nicht von einem Stream Processor — der Client faltet ohnehin. Damit existiert die Fachlogik genau einmal, in TypeScript. Der Snapshot ist reiner Bootstrap-Cache und nie autoritativ; jeder Client kann ihn gegen den Log nachrechnen.

### Membership: eine Projektion, die der Server besitzt

Wer auf ein Aggregate schreiben darf, wird **nicht** aus dem client-geschriebenen Log abgeleitet — sonst stammte die Autorisierungsgrundlage aus genau dem Stream, den die Autorisierung schützen soll. Alle Zugriffsänderungen laufen über Command-Endpunkte, die der Server validiert und deren Event er selbst schreibt.

### API

```
Events (generisch, ein Lambda für alle Typen):
POST  /lists/{id}/events       → Envelope validieren, Position vergeben, appenden, publishen
GET   /lists/{id}/events       → Events seit ?since=<position>
GET   /lists/{id}/snapshot     → Snapshot + upToPosition für den Bootstrap
GET   /lists                   → Aggregate-IDs des Aufrufers (Membership-Projektion)

Commands (je ein eigenes Lambda, Server schreibt das Event):
POST    /lists/{id}/invites    → Owner-only: Invite-Token (Link/QR)
POST    /lists/join            → Token prüfen, listMemberAdded
DELETE  /lists/{id}/members/…  → listMemberRemoved
```

Analog für `/recipes/{id}/events` und `/plans/{id}/events`. Vollständige Liste in [../services/events.md](../services/events.md).

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

**Event-Metadaten:** Jedes Event trägt in `meta` eine `eventId` (Idempotenz beim Senden, Match gegen die Pending-Queue) und eine `deviceId` (Herkunft), beide erzeugt in der Middleware. Bestätigte Events tragen zusätzlich die vom Server vergebene `position`.

**Keine Feld-Versionen.** Die Domain-Types oben (`ListItem` etc.) sind vollständig — es gibt keinen zusätzlichen `{ value, version }`-Wrapper pro konfliktbehaftetem Feld. Konflikte werden nicht durch Versionsvergleich im Reducer aufgelöst, sondern dadurch, dass alle Clients das server-geordnete Log in Positions-Reihenfolge falten. Siehe [conflict-resolution.md](./conflict-resolution.md) §3 und [sync-engine.md](./sync-engine.md).

**Reducer-Constraint:** Weil beim Rebase mehrfach gefaltet wird, müssen alle Reducer replay-pur sein — kein `Date.now()`, kein `crypto.randomUUID()`, kein `Math.random()`. IDs und Timestamps entstehen in der Middleware und reisen im Event mit.

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
- **Dietary Preferences**: Lebten auf dem gestrichenen Family-Aggregate — wohin damit (User-Aggregate, Local Preference, streichen)? Siehe [status.md](./status.md) §7.
- **Custom Variants Scope**: Auf dem ShoppingList-Aggregate (pro Liste). Ein übergreifender Scope bräuchte nach Wegfall des Familien-Konzepts ein User-Aggregate — offen, kann später migriert werden.
