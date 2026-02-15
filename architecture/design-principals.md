# Design Principles — ShopZebra

## Philosophische Grundlagen

Unsere Architektur-Entscheidungen basieren auf drei Quellen, die unabhängig voneinander zu den gleichen Einsichten kommen:

### Simple Made Easy 

**Simple** und **Easy** sind nicht dasselbe. Es sind zwei unabhängige Achsen — etwas kann simple und easy sein, simple und hard, complex und easy, oder complex und hard.

**Simple** (lat. *simplex* = eine Falte, ein Strang):
- Eigenschaft der Sache selbst — **objektiv**, unabhängig vom Betrachter
- Bedeutet: **ein Konzept, eine Aufgabe, eine Verantwortung**. Nicht verwoben mit anderen Konzepten
- Das Gegenteil ist **complex** (lat. *complectere* = zusammenflechten): mehrere Konzepte miteinander verwoben
- **Wie erkennt man es?** Man kann hinschauen und zählen: Wie viele unabhängige Konzepte sind hier miteinander verflochten? Eine pure Funktion `(input) → output` ist simple — ein Konzept. Ein `useEffect` der gleichzeitig Daten lädt, State aktualisiert und auf Lifecycle-Events reagiert ist complex — drei Konzepte verwoben

**Easy** (lat. *adjacens* = naheliegend):
- Eigenschaft der **Beziehung zwischen dir und der Sache** — **subjektiv**, abhängig von Erfahrung und Vertrautheit
- Bedeutet: vertraut, griffbereit, schnell startbar. Deutsch ist nicht inhärent schwer — nur für jemanden der kein Deutsch kann
- Das Gegenteil ist **hard**: unvertraut, weit weg vom eigenen Erfahrungshorizont
- **Wie erkennt man es?** Wenn die Begründung für eine Technologie "das kennen wir schon", "schneller Einstieg" oder "wenig Boilerplate" lautet — das sind Easy-Argumente. Sie sagen nichts über die Simplicity des Artefakts aus

**Die Verwechslung ist der Kern des Problems.** Wir sagen "das ist einfach" und meinen damit oft "das ist mir vertraut". Ein Framework kann *easy* sein (schneller Start, vertraute API, wenig Setup) und trotzdem *complex* (verwobene Konzepte, schwer zu debuggen, sobald ein nicht-trivialer Fall auftritt). Der Preis für Komplexität kommt immer — nur später.

Das Verweben von Konzepten heißt **Complecting**. Beispiele: Ein Objekt verwebt State, Identity und Value. Ein `useEffect` verwebt UI-Logik mit Netzwerk-Calls und State-Updates. Jedes Complecting erschwert das Verständnis des Systems überproportional — nicht linear, weil man die Wechselwirkungen zwischen allen verwobenen Konzepten mitdenken muss.

**Einfache Bausteine**: Values statt Objects, Functions statt Methods, Data statt Syntax, Queues statt direkte Aufrufe. Wenige, orthogonale Konzepte, konsequent angewandt.

#### Simple vs Easy als Entscheidungsinstrument

Wenn wir Technologien, Libraries oder Implementierungsansätze bewerten, ist **Simple vs Easy die zentrale Frage**. Nicht: "Wie schnell bin ich produktiv?" Sondern: "Was passiert, wenn es schwierig wird?"

Hickeys Beobachtung: Wer Easy priorisiert und Simple ignoriert, hat anfangs hohe Velocity — aber die Komplexität holt einen ein. Jeder Sprint erledigt weniger, weil das System immer schwerer zu verstehen ist. Wer Simple priorisiert, investiert mehr am Anfang, hält aber die Velocity konstant.

**Der Abstraktions-Test:** Eine gute Abstraktion verbirgt Komplexität so, dass man sie nicht debuggen muss. Eine schlechte Abstraktion verbirgt Komplexität so lange, bis man sie doch debuggen muss — und dann muss man *alle* verwobenen Konzepte gleichzeitig verstehen.

| Bewertung | Beispiel | Warum |
|-----------|----------|-------|
| **Simple** | Redux | Wenige orthogonale Konzepte: Store, Action, Reducer. Jedes unabhängig verstehbar. Wenn man debuggt, schaut man den State und die Action an — fertig |
| **Simple** | TCP | Gute Abstraktion — man muss TCP in der Praxis nicht debuggen. Es verbirgt Komplexität (Retransmission, Flow Control, Congestion) hinter einer verlässlichen Schnittstelle |
| **Easy, nicht Simple** | React Query | Der einfache Fall (`useQuery(key, fetcher)`) fühlt sich leicht an. Aber unter der Oberfläche verwebt es Caching, Refetching, Stale-Time, Garbage Collection, Retry-Logik und Deduplication. Sobald ein schwieriger Fall auftritt — Cache-Invalidierung, Race Conditions, Abhängigkeiten zwischen Queries — muss man alle diese Konzepte gleichzeitig verstehen und debuggen |
| **Easy, nicht Simple** | `useEffect`-Ketten | Fühlt sich vertraut an, aber verwebt Lifecycle, State-Updates und Side Effects. Schwer zu debuggen, weil die Ursache einer Wirkung über mehrere Effects verteilt ist |

**Bei jeder Architektur- und Implementierungsentscheidung fragen:**
1. Wie viele Konzepte werden miteinander verwoben?
2. Kann ich jedes Konzept unabhängig verstehen und testen?
3. Was passiert, wenn ich den schwierigen Fall debuggen muss — muss ich die ganze Maschine verstehen, oder nur den relevanten Teil?

#### Bewusste Abweichung: TypeScript als gewolltes Complecting

Hickey ist skeptisch gegenüber Typsystemen — sein Schlusswort in "Simple Made Easy" warnt vor "sophisticated type systems" als Komplexitätsquelle. Er arbeitet mit Clojure, einer dynamisch typisierten Sprache, in der Daten als generische Maps fließen.

Wir weichen hier bewusst ab. TypeScript's Typsystem verwebt Types mit Logik — das ist per Definition Complecting. Aber wir akzeptieren diesen Trade-off, weil:
- **Types fangen Fehler zur Compile-Zeit** statt zur Laufzeit. In einer App die offline funktionieren muss und Events über die Netzwerkgrenze synct, sind Laufzeit-Fehler teuer
- **Discriminated Unions modellieren Domänen-Constraints** (siehe Prinzip 8). Unmögliche Zustände werden unmöglich — das ist ein Gewinn an Simplicity auf einer höheren Ebene
- **Explizite Typen sind Dokumentation** die der Compiler erzwingt. Sie machen Interfaces zwischen Domänen lesbar, ohne den Code lesen zu müssen
- **Das Complecting ist begrenzt**: Types beschreiben die Shape von Daten, sie steuern nicht den Kontrollfluss. Im Gegensatz zu Java-Style OOP (wo Types, Vererbung, Polymorphie und State miteinander verwoben sind) bleiben unsere Types deklarative Datenbeschreibungen

Die Regel: **Types beschreiben, Funktionen transformieren.** Types und Logik bleiben konzeptionell getrennt, auch wenn TypeScript sie syntaktisch in dieselbe Datei bringt.

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

Aus den Grundlagen leiten wir zehn konkrete Prinzipien ab:

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
const doneCount = items.filter(item => item.done).length;        // berechnet
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

### 8. Intention-Revealing Code

Jeder Name — Variable, Funktion, Komponente, Datei, Ordner — muss seinen Zweck offenbaren, ohne dass man den umgebenden Code lesen muss. Code erklärt *was* er tut durch seine Struktur und Benennung. Kommentare erklären nur *warum* eine Entscheidung so getroffen wurde — nie *was* der Code macht.

```tsx
// FALSCH: Name verschleiert Absicht
const d = items.filter(i => i.s === 'done');
function proc(lst: string[]) { ... }

// RICHTIG: Intention-Revealing
const completedItems = items.filter(item => item.status === 'done');
function addIngredientsToShoppingList(ingredientNames: readonly string[]) { ... }
```

Keine Abkürzungen (`i`, `k`, `ctx`, `mgr`). Keine generischen Namen (`data`, `info`, `handler`, `manager`, `helper`, `utils`). Jedes Konzept verdient einen Namen der seine Domäne widerspiegelt.

### 9. Readability First

Code wird öfter gelesen als geschrieben. Lesbarkeit hat Vorrang vor Kürze.

**Kleine Komponenten.** Eine Komponente die nicht auf einen Bildschirm passt, tut zu viel. Lieber in benannte Sub-Komponenten aufteilen — jede mit einem klaren, intention-revealing Namen.

**Kleine Funktionen.** Multi-Step-Logik in benannte Funktionen extrahieren. Eine Funktion sollte wie eine klare Abfolge von Schritten lesbar sein — niedrige zyklomatische Komplexität.

```tsx
// FALSCH: alles in einer Funktion
function processWeekPlan(plan: WeekPlan) {
  const ingredients: Ingredient[] = [];
  for (const day of plan.days) {
    for (const recipe of day.recipes) {
      for (const ing of recipe.ingredients) {
        const existing = ingredients.find(entry => entry.name === ing.name);
        if (existing) {
          existing.quantity += ing.quantity;
        } else {
          ingredients.push({ ...ing });
        }
      }
    }
  }
  return ingredients;
}

// RICHTIG: benannte Schritte
function collectIngredientsFromWeekPlan(plan: WeekPlan): readonly Ingredient[] {
  const allIngredients = extractAllIngredients(plan.days);
  return mergeByName(allIngredients);
}
```

**Kommentare nur für Warum.** Selbsterklärender Code braucht keine Kommentare. Wenn ein Kommentar nötig ist, erklärt er die Entscheidung hinter dem Code, nicht seinen Ablauf. Kommentare immer auf Englisch.

### 10. Domänen-orientierte Organisation mit hoher Kohäsion

Code wird nach Domänen-Konzepten organisiert (shopping-list, recipes, meal-plan), nicht nach technischen Kategorien (components, hooks, utils). Jede Domäne ist ein vertikaler Schnitt durch die Architektur: Slice + Selektoren + Komponenten + Route leben zusammen in einem Ordner.

**Low Coupling zwischen Domänen**: Domänen kommunizieren ausschließlich über Redux Actions — nie über direkte Imports von Typen, Funktionen oder Komponenten. Wenn `meal-plan` Zutaten auf die Einkaufsliste schieben will, dispatcht es ein Event. Der `shopping-list`-Reducer entscheidet, was daraus wird. Keine Domäne kennt die interne Struktur einer anderen.

**High Cohesion innerhalb einer Domäne**: Alles was zum selben Konzept gehört lebt zusammen — Slice, Selektoren, Komponenten, Route-Definition, Tests. Der Cohesion-Test: Wenn du eine User-Story implementierst, solltest du überwiegend einen Ordner anfassen.

**Kein `shared/`-, `common/`- oder `utils/`-Ordner.** Diese Ordner werden zu Sammelbecken für Dinge die nichts miteinander zu tun haben — niedrige Kohäsion per Definition. Stattdessen: UI-Primitives (Button, Modal) gehören in einen `ui/`-Ordner — das ist ein kohärentes Konzept (Design-System). Store-Hooks gehören in `app/`. Alles andere gehört in die Domäne die es benutzt. Wenn eine Funktion von zwei Domänen gebraucht wird, ist sie entweder ein eigenes benanntes Konzept (eigener Ordner) oder sie wird dupliziert — Duplikation ist besser als falsches Coupling.

**Denkwerkzeuge zur Prüfung der Kohäsion:**
- **Actions-Test**: Lies die Actions eines Slices. Beschreiben sie alle dasselbe Konzept? Wenn nicht → aufteilen
- **Selektor-Test**: Wenn eine Komponente aus 4+ Slices liest, tut sie zu viel oder die Slice-Grenzen sind falsch
- **Naming-Test**: Ordner/Dateien die "helpers", "utils", "misc", "common" heißen sind ein Red Flag für niedrige Kohäsion. Jedes Konzept verdient einen klaren Namen
- **Größen-Test**: Wenn ein Slice oder eine Komponente zu lang wird um sie auf einen Blick zu verstehen, vermischt sie wahrscheinlich zwei Konzepte



Für Technologie-Entscheidungen und deren Begründung siehe [design-decisions.md](./design-decisions.md).
