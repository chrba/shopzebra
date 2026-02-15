# React Design Principles — ShopZebra

## Philosophische Grundlagen

Unsere Architektur-Entscheidungen basieren auf drei Quellen, die unabhängig voneinander zu den gleichen Einsichten kommen:

### Simple Made Easy 

**Simple** und **Easy** sind nicht dasselbe. Simple bedeutet: eine Sache, nicht verwoben, objektiv messbar. Easy bedeutet: vertraut, bequem, subjektiv. Ein Framework kann *easy* sein (schneller Start, vertraute API) und trotzdem *complex* (verwobene Konzepte, schwer zu debuggen). Der Preis für Komplexität kommt immer — nur später.

Das Verweben von Konzepten heißt **Complecting**. Beispiele: Ein Objekt verwebt State, Identity und Value. Ein `useEffect` verwebt UI-Logik mit Netzwerk-Calls und State-Updates. Jedes Complecting erschwert das Verständnis des Systems überproportional.

**Einfache Bausteine**: Values statt Objects, Functions statt Methods, Data statt Syntax, Queues statt direkte Aufrufe. Wenige, orthogonale Konzepte, konsequent angewandt.

### Re-frame (ClojureScript-Framework)

Re-frame implementiert einen unidirektionalen Datenfluss in sechs Schritten ("6 Dominoes"):

```
Event Dispatch → Event Handler → Effect Handling → State Update → Signal Graph → View → DOM
      ↑                                                                                 │
      └─────────────────────────────────────────────────────────────────────────────────┘
```

Kernideen:
- **Events sind Daten**, keine Funktionsaufrufe: `[:item-checked list-id item-id]`
- **Event Handler sind pure Funktionen**: Sie empfangen State + Event, geben neuen State + Effect-Beschreibungen zurück — ohne selbst Side Effects auszuführen
- **Effects sind deklarativ**: Handler beschreiben *was* passieren soll (als Daten), nicht *wie*. Die Ausführung ist separat. Das macht Handler testbar
- **Subscriptions statt gespeichertem Derived State**: Man speichert nicht "gefilterte Items" — man berechnet sie aus dem zentralen State. Alles, was ableitbar ist, wird abgeleitet
- **Ein zentraler Store** (`app-db`): Kein verteilter State über Objekte oder Komponenten

### Redux

Redux überträgt dieselben Ideen nach JavaScript:
- **Single Source of Truth**: Ein Store, ein State-Baum
- **State is Read-Only**: Änderungen nur durch Actions (Plain Objects)
- **Pure Reducers**: Zustandsübergänge als pure Funktionen

---

## Design-Prinzipien

Aus den Grundlagen leiten wir sieben konkrete Prinzipien ab:

### 1. Single App State

Ein zentraler Redux Store hält den gesamten Anwendungszustand. Kein State in Komponenten (außer rein lokaler UI-State wie "ist Dropdown offen"). Begründung: Verteilter State ist die häufigste Quelle von Inkonsistenzen und Bugs. Ein zentraler Store macht den gesamten Zustand inspizierbar und reproduzierbar.

### 2. Events als Daten

User-Aktionen werden als Action-Objekte beschrieben: `{type: 'item/checked', payload: {listId, itemId}}`. Keine direkten Funktionsaufrufe aus Komponenten heraus. Begründung: Actions sind serialisierbar, loggbar, replaybar. Das ermöglicht Debugging, Undo/Redo und Event Sourcing über die Netzwerkgrenze.

### 3. Pure Event Handler (Reducers)

Business-Logik lebt in puren Funktionen, vollständig getrennt von React. Ein Reducer nimmt State + Action und gibt neuen State zurück — ohne Side Effects, ohne API-Calls, ohne DOM-Manipulation. Begründung: Pure Funktionen sind testbar ohne Mocks, vorhersagbar und leicht zu verstehen.

### 4. Derived Data Everywhere

Kein redundanter State. Alles was berechenbar ist, wird berechnet — nicht gespeichert.

```tsx
// FALSCH: redundanter State
const [items, setItems] = useState([...]);
const [doneCount, setDoneCount] = useState(0);
const [progress, setProgress] = useState(0);

// RICHTIG: derived data via Selektoren
const items = useSelector(selectItems);
const doneCount = items.filter(i => i.done).length;        // berechnet
const progress = items.length ? doneCount / items.length : 0; // berechnet
```

Begründung: Gespeicherter Derived State kann out-of-sync geraten. Berechneter State ist per Definition konsistent.

### 5. Deklarative Side Effects

Side Effects (API-Calls, lokale DB, Notifications) werden in Redux Middleware (Thunks) beschrieben und ausgeführt — nie in Komponenten. Begründung: Trennt "was soll passieren" von "wie und wann". Macht Business-Logik testbar und Effects austauschbar (z.B. Mock-API in Tests).

### 6. Minimale useEffect-Nutzung

`useEffect` ist ein Escape Hatch, kein Default. Legitim nur für echte externe Synchronisation (WebSocket-Listener, Capacitor-Plugin-Events). Nie für Daten-Transformation, nie für State-Synchronisation, nie für Daten laden.

Warum: `useEffect` verwebt Lifecycle, State-Updates und Side Effects in einer Komponente — genau das Complecting aus dem Simple-Made-Easy-Prinzip. React selbst [empfiehlt](https://react.dev/learn/you-might-not-need-an-effect), die meisten useEffect-Aufrufe durch Berechnungen im Render, Event Handler oder `useMemo` zu ersetzen.

### 7. Komponenten sind dumm

Views lesen Daten aus dem Redux Store (via Selektoren) und dispatchen Events (Actions). Keine Business-Logik in Komponenten. Eine Komponente entscheidet nie, *was* bei einem Klick passieren soll — sie sagt nur "es wurde geklickt", der Reducer entscheidet den Rest.

---

## Technologie-Entscheidungen

### TanStack Router — Routing + Daten-Initialisierung

**Gewählt weil:**
- Loaders sind ein Kern-Feature: Daten werden geladen *bevor* eine Seite rendert. Eliminiert `useEffect` für Datenladen komplett
- Alles ist explizit — Routen sind Code, kein Dateisystem-Scan, keine Build-Magic
- TypeScript-first: Params, Search-Params, Loader-Daten sind typsicher ohne Code-Generierung
- File-based Routing ist optional, nicht erzwungen

**Verworfen — React Router v7:**
React Router v7 hat sich in "Framework Mode" (viel Konvention und Magic) und "Declarative Mode" (Loaders schlecht integriert) aufgespalten. Wir priorisieren Transparenz über Magic.

**Wie Loaders mit Redux zusammenspielen:**
```tsx
const shoppingListRoute = createRoute({
  path: '/lists/$listId',
  loader: ({ params }) => store.dispatch(loadList(params.listId)),
  component: ShoppingListView,  // liest aus Redux, nicht aus loaderData
})
```
Der Loader ist der Trigger, Redux bleibt die Single Source of Truth.

### Redux Toolkit (RTK) — State Management + Business-Logik

**Gewählt weil:**
- Konsequenteste Umsetzung der re-frame-Prinzipien in React: Single Store, Actions als Daten, pure Reducers
- Selektoren für Derived Data (entspricht re-frame Subscriptions)
- Middleware für Side Effects (entspricht re-frame Effect Handlers)
- RTK Query bei Bedarf eingebaut — keine Extra-Dependency für Server-Calls

### Capacitor — Native Shell

Mobile App mit Zugriff auf native APIs (SQLite, Kamera, Haptics, Push Notifications) bei einer einzigen React-Codebase.

---

## Bewusst nicht gewählt

### TanStack Query / React Query

**Problem das es löst:** Server ist Source of Truth → effizient lokal cachen (Fetch, SWR, Retry, Background Refetch).

**Warum nicht für ShopZebra:** Unser Datenfluss ist umgekehrt. Die lokale DB ist die Source of Truth, der Server wird gesynct. TanStack Query würde eine zweite Caching-Schicht einführen, die keines unserer Probleme löst — nur Komplexität addiert. Falls wir doch Server-API-Calls brauchen (Rezept-Import per URL), nutzen wir RTK Query, das bereits in Redux Toolkit enthalten ist.

### CRDTs (Yjs, Automerge)

**Problem das sie lösen:** Conflict-free Merge bei gleichzeitiger Bearbeitung desselben Dokuments (z.B. Text in Google Docs).

**Warum nicht für ShopZebra:**
1. **Overkill für unser Datenmodell.** Shopping-Listen-Konflikte sind trivial: Zwei User fügen Items hinzu → beide erscheinen. Jemand hakt ab → idempotent. Menge ändern → Last-Writer-Wins reicht. Dafür braucht man keine CRDT-Mathematik
2. **Kein DynamoDB-Support.** Yjs und Automerge bringen eigene Sync-Server mit. Die Integration mit DynamoDB müssten wir komplett selbst bauen
3. **Wachsende Dokumente.** CRDTs speichern History. Über Monate wachsen Dokumente unbegrenzt. Automerge hat ein 4GB WebAssembly-Limit. Cinapse (Terminplanungs-Software) ist aus genau diesem Grund von Automerge weggemigriert — 89% weniger Support-Tickets danach
4. **Pragmatik > Eleganz.** CRDTs passen philosophisch zum funktionalen Ansatz (Merge ist eine pure Funktion). Aber sie lösen ein Problem, das wir nicht haben, mit Komplexität, die wir nicht brauchen

### Zustand

Minimal und boilerplate-arm, aber kein eingebautes Event/Effect-System. Man muss die Disziplin der Architektur-Prinzipien komplett selbst durchsetzen. Redux Toolkit gibt uns die Leitplanken, die diese Prinzipien erzwingen.

---

## Sync-Architektur: Event Sourcing mit DynamoDB

Für Echtzeit-Kollaboration (mehrere Familienmitglieder auf derselben Liste) verwenden wir Event Sourcing — das ist der funktionale Ansatz für verteilte Systeme:

### Prinzip

Statt Datensätze zu mutieren, speichern wir **Events** (immutable Values):

```
{type: "ITEM_ADDED",   listId: "abc", item: "Milch",  by: "papa", t: 1707...}
{type: "ITEM_CHECKED", listId: "abc", itemId: "xyz",   by: "mama", t: 1707...}
```

Der aktuelle Zustand wird aus Events **abgeleitet** — Derived Data, konsequent zu Ende gedacht.

### Datenfluss

```
Papa hakt Milch ab
  → Redux Action: dispatch(itemChecked({listId, itemId}))
  → Reducer: aktualisiert lokalen State
  → Thunk: schreibt Event in DynamoDB Events-Table
  → DynamoDB Stream: propagiert Event
  → API Gateway WebSocket: pusht an Mamas Client
  → Mamas Redux Store: dispatch(itemChecked({listId, itemId}))
  → Mamas UI: Milch ist abgehakt
```

### Architektur-Schichten

```
┌─────────────────────────────────────────┐
│              DynamoDB                    │
│   Events-Table      State-Table         │
│   (append-only)     (materialized view) │
│        │                                │
│        ▼                                │
│   DynamoDB Stream                       │
└────────┬────────────────────────────────┘
         │
    API Gateway WebSocket
         │
    ┌────┴────┐
    ▼         ▼
  Papa      Mama
  Redux     Redux
  Store     Store
```

### Warum Event Sourcing passt

- **Events sind immutable Values** — Kernforderung des Simple-Made-Easy-Prinzips
- **State ist Derived Data** — re-frame-Prinzip, über die Netzwerkgrenze hinweg
- **DynamoDB Streams sind eingebaut** — kein extra Sync-Server nötig
- **Offline-fähig**: Events werden lokal in SQLite gequeued, beim Reconnect gesendet
- **Vollständig nachvollziehbar**: Wer hat wann was geändert (Activity Feed ist gratis)
- **Conflict Resolution ist trivial**: Events werden append-only geschrieben. Reihenfolge per Timestamp + Device-ID. Keine Merge-Konflikte
- **Testbar**: Event-Replay in Tests reproduziert jeden Zustand deterministisch
