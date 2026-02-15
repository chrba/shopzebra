# React Best Practices — ShopZebra

Dieses Dokument beschreibt konkrete Best Practices für die Umsetzung. Für die Architektur-Prinzipien siehe [design-principals.md](./design-principals.md), für Technologie-Entscheidungen siehe [design-decisions.md](./design-decisions.md).

---

## Projekt-Struktur

Wir verwenden **Feature-basierte Organisation**. Jedes Feature ist ein eigenständiges Modul mit klaren Grenzen.

```
src/
├── app/
│   ├── store.ts              # Redux Store Setup
│   ├── router.ts             # TanStack Router Konfiguration
│   └── App.tsx               # Root-Komponente, Provider
│
├── features/
│   ├── shopping-list/
│   │   ├── shoppingListSlice.ts   # Reducer + Actions + Selektoren
│   │   ├── ShoppingListView.tsx   # Route-Komponente
│   │   ├── ShoppingListItem.tsx   # Presentational Component
│   │   ├── CategoryGroup.tsx
│   │   └── shoppingListRoute.ts   # TanStack Route-Definition + Loader
│   │
│   ├── meal-plan/
│   │   ├── mealPlanSlice.ts
│   │   ├── MealPlanView.tsx
│   │   └── mealPlanRoute.ts
│   │
│   ├── recipes/
│   │   └── ...
│   │
│   └── activity/
│       └── ...
│
├── ui/                          # Design-System: kohärentes Konzept, alle visuellen Primitives
│   ├── Button.tsx
│   ├── Modal.tsx
│   ├── ProgressBar.tsx
│   └── EmptyState.tsx
│
└── sync/
    ├── syncMiddleware.ts     # Redux Middleware für Event Sourcing
    ├── appSyncEvents.ts      # AppSync Events Pub/Sub-Verbindung
    └── offlineQueue.ts       # SQLite Offline-Queue
```

### Regeln

- **Domänen kommunizieren über Redux Actions**, nie über direkte Imports. Wenn `meal-plan` Zutaten auf die Einkaufsliste schieben will, dispatcht es ein Event — der `shopping-list`-Reducer entscheidet was daraus wird.
- **Kein `shared/`-, `common/`- oder `utils/`-Ordner.** UI-Primitives leben in `ui/`. Store-Hooks leben in `app/hooks.ts`. Alles andere gehört in die Domäne die es benutzt.
- **Barrel files (`index.ts`) nur als bewusste Public API.** Ein Feature-Ordner darf eine `index.ts` haben, die gezielt exportiert was andere Domänen sehen sollen — das erzwingt Domänen-Grenzen. Kein blindes Re-Exportieren aller Interna. Innerhalb einer Domäne: direkte Imports.
- **Flache Hierarchie.** Maximal 2-3 Ordner-Ebenen. Tiefe Verschachtelung macht Imports unhandlich und Refactoring zur Qual.
- **Kein `types/`-Verzeichnis.** Types leben dort wo sie benutzt werden — im Slice, in der Komponente, im Feature-Ordner.
- **Kein `components/`-Verzeichnis pro Feature** wenn es nur 2-3 Komponenten sind. Flach im Feature-Ordner ist besser.

---

## Redux Toolkit Patterns

### Slice-Struktur

Ein Slice enthält Reducer, Actions und Selektoren in einer Datei. Alle Logik die den State-Shape kennt, lebt an einem Ort.

```tsx
// features/shopping-list/shoppingListSlice.ts

interface ShoppingItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly done: boolean;
  readonly quantity?: string;
  readonly addedBy: string;
}

interface ShoppingListState {
  readonly items: readonly ShoppingItem[];
  readonly listId: string;
  readonly listName: string;
}

const shoppingListSlice = createSlice({
  name: 'shoppingList',
  initialState,
  reducers: {
    itemChecked(state, action: PayloadAction<{ itemId: string }>): ShoppingListState {
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.itemId ? { ...item, done: true } : item
        ),
      };
    },
    itemAdded(state, action: PayloadAction<Omit<ShoppingItem, 'id' | 'done'>>): ShoppingListState {
      return {
        ...state,
        items: [...state.items, { ...action.payload, id: nanoid(), done: false }],
      };
    },
  },
});

// Selektoren: Derived Data, co-located mit dem Slice
export const selectItems = (state: RootState) => state.shoppingList.items;
export const selectOpenItems = (state: RootState) =>
  state.shoppingList.items.filter(item => !item.done);
export const selectDoneItems = (state: RootState) =>
  state.shoppingList.items.filter(item => item.done);
export const selectProgress = (state: RootState) => {
  const { items } = state.shoppingList;
  return items.length ? items.filter(item => item.done).length / items.length : 0;
};
```

### Selektor-Best-Practices

- **Selektoren gehören in den Slice** — nicht in die Komponente. Der Slice kennt den State-Shape, die Komponente sollte es nicht.
- **Kleine, fokussierte Selektoren** statt einem großen. `selectOpenItems` und `selectDoneItems` statt `selectAllListData`.
- **`createSelector` für teure Berechnungen** — wenn ein Selektor filtert, sortiert oder transformiert und die Eingabe sich selten ändert. Für einfache Property-Zugriffe ist es unnötig.

```tsx
// Memoized Selektor für teure Berechnung
import { createSelector } from '@reduxjs/toolkit';

export const selectItemsByCategory = createSelector(
  [selectOpenItems],
  (items) => Object.groupBy(items, item => item.category)
);
```

### Logik gehört in den Reducer, nicht in die Komponente

```tsx
// FALSCH: Business-Logik in der Komponente
function handleCheck(itemId: string) {
  const item = items.find(entry => entry.id === itemId);
  if (item && !item.done) {
    dispatch(setItemDone({ itemId, done: true }));
    dispatch(incrementDoneCount());
    if (allDone) dispatch(showCompletionMessage());
  }
}

// RICHTIG: Komponente dispatcht nur ein Event, Reducer entscheidet
function handleCheck(itemId: string) {
  dispatch(itemChecked({ itemId }));
}
```

Der Reducer handhabt alle Konsequenzen: State-Update, abgeleitete Werte, Folgezustände. Die Komponente weiß nicht *was* passiert — nur *dass* etwas passiert ist.

---

## Komponenten-Patterns

### Komponenten-Typen

Wir unterscheiden zwei Arten:

**Container-Komponenten** (pro Route eine): Verbinden Redux mit der UI.
```tsx
function ShoppingListView() {
  const items = useAppSelector(selectItemsByCategory);
  const progress = useAppSelector(selectProgress);
  const dispatch = useAppDispatch();

  return (
    <div>
      <ProgressBar value={progress} />
      {Object.entries(items).map(([category, categoryItems]) => (
        <CategoryGroup
          key={category}
          category={category}
          items={categoryItems}
          onCheck={(id) => dispatch(itemChecked({ itemId: id }))}
        />
      ))}
    </div>
  );
}
```

**Presentational-Komponenten**: Empfangen Daten via Props, kennen weder Redux noch Router.
```tsx
function CategoryGroup({ category, items, onCheck }: CategoryGroupProps) {
  return (
    <section>
      <h2>{category} ({items.length})</h2>
      {items.map(item => (
        <ShoppingListItem key={item.id} item={item} onCheck={onCheck} />
      ))}
    </section>
  );
}
```

Presentational-Komponenten sind wiederverwendbar und testbar ohne Store-Setup.

### Prop Drilling vermeiden

Da der App-State im Redux Store lebt, entsteht kaum Prop Drilling. Wenn eine tief verschachtelte Komponente Daten braucht, liest sie direkt aus dem Store:

```tsx
// Kein Prop Drilling nötig — direkt aus dem Store lesen
function DeepNestedComponent() {
  const userName = useAppSelector(selectCurrentUserName);
  return <span>{userName}</span>;
}
```

Nur Presentational-Komponenten empfangen Props. Container-Komponenten lesen aus dem Store. React Context wird fast nie benötigt — Redux übernimmt diese Rolle.

### Komposition statt Konfiguration

```tsx
// FALSCH: Konfiguration über Props
<List
  items={items}
  renderItem={(item) => <Item item={item} />}
  showHeader={true}
  headerText="Einkaufsliste"
  emptyMessage="Keine Items"
/>

// RICHTIG: Komposition über Children
<List>
  <ListHeader>Einkaufsliste</ListHeader>
  {items.map(item => <Item key={item.id} item={item} />)}
  {items.length === 0 && <EmptyState>Keine Items</EmptyState>}
</List>
```

Komposition ist transparenter: Man sieht im JSX was gerendert wird, statt es über Konfiguration zu steuern.

---

## Hook-Verwendung

Unsere Architektur (Single App State, dumme Komponenten, Business-Logik im Reducer) bestimmt, welche Hooks wann erlaubt sind. Die meisten React-Hooks lösen Probleme, die bei uns nicht existieren — weil Redux sie bereits löst.

### Standard-Hooks — frei verwenden

Diese zwei Hooks sind der Normalfall. Fast jede Container-Komponente nutzt genau diese:

```tsx
function ShoppingListView() {
  const items = useAppSelector(selectOpenItems);     // Daten lesen
  const dispatch = useAppDispatch();                  // Events dispatchen
  // ...
}
```

- **`useAppSelector`** — die primäre Art, wie Komponenten Daten lesen
- **`useAppDispatch`** — die primäre Art, wie Komponenten Aktionen auslösen

### useState — nur für ephemeren UI-State

Erlaubt für State, der **keinen Sinn außerhalb der Komponente hat** und **keinen Einfluss auf Business-Logik**:

```tsx
// OK: rein visueller Zustand
const [isDropdownOpen, setDropdownOpen] = useState(false);
const [searchInput, setSearchInput] = useState('');

// FALSCH: gehört in den Redux Store
const [selectedItems, setSelectedItems] = useState<string[]>([]);
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
```

**Faustregel:** Wenn der State nach einem Page-Refresh wiederhergestellt werden sollte, gehört er in Redux. Wenn er beim Unmount der Komponente verschwinden darf, ist `useState` okay.

### useEffect — nur für externe Systeme

Bereits in Prinzip #6 definiert. Hier nochmal die klare Abgrenzung:

```tsx
// OK: AppSync Events Subscription (externes System)
useEffect(() => {
  const unsubscribe = appSyncEvents.subscribe(`lists/${listId}`, (event) => {
    dispatch(remoteEventReceived(event));
  });
  return unsubscribe;
}, [listId]);

// OK: Capacitor-Plugin (externes System)
useEffect(() => {
  const listener = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) dispatch(syncOnResume());
  });
  return () => listener.remove();
}, []);

// FALSCH: Daten laden — dafür gibt es Route Loaders
useEffect(() => { dispatch(loadList(listId)); }, [listId]);

// FALSCH: State ableiten — dafür gibt es Selektoren
useEffect(() => { setTotal(items.length); }, [items]);

// FALSCH: auf State reagieren — dafür gibt es Reducer oder Middleware
useEffect(() => {
  if (allDone) showConfetti();
}, [allDone]);
```

### useRef — nur für DOM-Referenzen

```tsx
// OK: DOM-Element referenzieren
const inputRef = useRef<HTMLInputElement>(null);

// FALSCH: mutable State der Rendering beeinflusst — gehört in Redux
const previousItems = useRef<ShoppingItem[]>([]);
```

### Überflüssig in unserer Architektur

Diese Hooks lösen Probleme, die Redux bereits löst:

| Hook | Warum überflüssig |
|---|---|
| `useReducer` | Redux IS unser Reducer. `useReducer` erzeugt eine zweite State-Management-Schicht |
| `useContext` | Redux ersetzt Context für App-State. Ausnahme: Theme-Provider oder i18n, falls nicht über Redux gelöst |
| `useMemo` / `useCallback` | React Compiler (ab React 19) memoized automatisch. Nur bei gemessenen Performance-Problemen manuell einsetzen |

### Custom Hooks

Custom Hooks kapseln **externe Systeme**, nicht Business-Logik:

```tsx
// RICHTIG: kapselt externe System-Integration
function useAppSyncSubscription(channel: string) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const unsubscribe = appSyncEvents.subscribe(channel, (event) => {
      dispatch(remoteEventReceived(event));
    });
    return unsubscribe;
  }, [channel]);
}

// FALSCH: kapselt Business-Logik die in den Reducer gehört
function useShoppingList(listId: string) {
  const items = useAppSelector(selectItems);
  const dispatch = useAppDispatch();

  const checkItem = (itemId: string) => {
    dispatch(itemChecked({ itemId }));
    if (items.every(item => item.done)) {
      dispatch(showCompletionMessage());  // Business-Logik im Hook!
    }
  };

  return { items, checkItem };
}
```

**Naming:** Custom Hooks nach dem externen System benennen, nicht nach der Domäne. `useAppSyncSubscription` statt `useShoppingListSync`. Der Hook weiß nicht, welche Domäne ihn nutzt — er weiß nur, welches System er anbindet.

---

## TypeScript-Patterns

### Strict Type Safety

TypeScript wird mit voller Striktheit verwendet. Das Typsystem ist das primäre Werkzeug um Fehler zu verhindern — nicht Tests, nicht Laufzeit-Checks.

**Grundregeln:**
- **Kein `any` — niemals.** `any` schaltet den Compiler ab. `unknown` verwenden wenn der Typ nicht bekannt ist, dann mit Type Guards einschränken
- **Kein `as` Type-Casting** — nur wenn alle anderen Optionen ausgeschöpft sind. Jedes `as` ist eine Lüge an den Compiler. Ausnahme: In Tests ist `as` erlaubt für partielle State-Fixtures (z.B. `as RootState`), wenn das vollständige Objekt unnötig verbose wäre und den Test unleserlich macht
- **`const` statt `let`** — immer, wenn der Wert sich nicht ändert
- **`readonly` auf allen Properties** — Props, State, Domain-Types. Verhindert versehentliche Mutation

```tsx
// FALSCH: any zerstört Typsicherheit
function processItems(items: any[]) { ... }
const data = response as ShoppingList;

// RICHTIG: explizite Typen, unknown + Type Guards
function processItems(items: readonly ShoppingItem[]) { ... }

function isShoppingList(value: unknown): value is ShoppingList {
  return typeof value === 'object' && value !== null && 'items' in value;
}
```

**Explizite Annotationen** auf allen exportierten Funktionen, Konstruktoren und Klassen. Innerhalb von Funktionen darf TypeScript inferen — nach außen muss der Kontrakt explizit sein.

### Domain Modeling mit dem Typsystem

Domänen-Constraints im Typsystem abbilden, nicht in Laufzeit-Checks:

**Discriminated Unions** statt optionaler Properties für State-Varianten:

```tsx
// FALSCH: unmögliche Zustände sind möglich
interface RequestState {
  loading: boolean;
  data?: ShoppingItem[];
  error?: string;
}

// RICHTIG: jeder Zustand ist eindeutig
type RequestState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: readonly ShoppingItem[] }
  | { readonly status: 'error'; readonly error: string };
```

**Readonly Domain Types:**

```tsx
type ShoppingItem = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly done: boolean;
  readonly quantity?: string;
  readonly addedBy: string;
};
```

### Typed Hooks

Einmal definieren, überall verwenden:

```tsx
// app/hooks.ts
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

### Props typisieren

```tsx
// Interface direkt bei der Komponente, nicht in einem separaten types-Ordner
interface ShoppingListItemProps {
  readonly item: ShoppingItem;
  readonly onCheck: (id: string) => void;
}

function ShoppingListItem({ item, onCheck }: ShoppingListItemProps) {
  // ...
}
```

### Imports

Immer Named Imports verwenden. Keine Namespace-Imports:

```tsx
// FALSCH
import * as Utils from './helpers';

// RICHTIG
import { formatQuantity, parseIngredient } from './ingredientParser';
```

### Typen organisieren

- Kein zentrales `types.ts` mit zusammenhanglosen Definitionen
- Einfache Types direkt im Modul wo sie benutzt werden
- Komplexe Domain-Types in domain-spezifischen Modulen (z.B. `shoppingListSlice.ts`)
- Keine `types/`-Ordner — Types gehören zur Domäne

### Linting

Wenn ein Linter in `package.json` konfiguriert ist: nach jeder Änderung laufen lassen und Fehler fixen.

---

## Performance

### React Compiler statt manueller Memoization

React Compiler (ab React 19) memoized automatisch. Manuelles `useMemo`, `useCallback` und `React.memo` sind in den meisten Fällen nicht mehr nötig.

**Wann manuell memoizen:**
- Teure Berechnungen auf großen Listen (> 1000 Items) — `useMemo`
- Messbare Performance-Probleme nach Profiling — nicht prophylaktisch

**Wann nicht memoizen:**
- "Zur Sicherheit" — Memoization hat eigenen Overhead
- Einfache Berechnungen — `items.filter(...)` auf 50 Items ist schneller ohne Memoization
- Ohne gemessenes Problem — erst profilen, dann optimieren

### Redux-Selektoren als Performance-Schicht

Redux-Selektoren mit `createSelector` sind der primäre Ort für Performance-Optimierung. Wenn ein Selektor stabil bleibt (gleiche Referenz), rendert die Komponente nicht neu.

```tsx
// Nur wenn sich die offenen Items ändern, rendert die Komponente neu
const openItems = useAppSelector(selectOpenItems);
```

Das ist effektiver als `React.memo` auf der Komponente, weil es das Problem an der Quelle löst.

### Lazy Loading von Routes

TanStack Router unterstützt Lazy Loading pro Route. Features die nicht sofort gebraucht werden, werden erst bei Navigation geladen:

```tsx
const recipesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes',
  component: lazy(() => import('../features/recipes/RecipesView')),
});
```

---

## Routen und Datenladen

### Route-Definition mit Loader

Jede Route definiert in einer eigenen Datei, was geladen werden muss:

```tsx
// features/shopping-list/shoppingListRoute.ts
import { createRoute } from '@tanstack/react-router';
import { store } from '../../app/store';
import { loadList } from './shoppingListSlice';
import { ShoppingListView } from './ShoppingListView';

export const shoppingListRoute = createRoute({
  getParentRoute: () => listsRoute,
  path: '$listId',
  loader: async ({ params }) => {
    await store.dispatch(loadList(params.listId)).unwrap();
  },
  component: ShoppingListView,
});
```

### Kein useEffect für Datenladen

```tsx
// FALSCH
function ShoppingListView() {
  const { listId } = useParams();
  useEffect(() => {
    dispatch(loadList(listId));
  }, [listId]);
  if (loading) return <Spinner />;
  // ...
}

// RICHTIG: Loader hat die Daten bereits geladen
function ShoppingListView() {
  const items = useAppSelector(selectItems);  // Daten sind da
  // ...
}
```

Der Loader garantiert: Wenn die Komponente rendert, sind die Daten im Store.

---

## Testing

### Reducers testen (pure Funktionen — einfach)

```tsx
test('itemChecked markiert Item als done', () => {
  const state = { items: [{ id: '1', name: 'Milch', done: false }] };
  const result = shoppingListReducer(state, itemChecked({ itemId: '1' }));
  expect(result.items[0].done).toBe(true);
});
```

### Selektoren testen (pure Funktionen — einfach)

```tsx
test('selectProgress berechnet Fortschritt korrekt', () => {
  const state = {
    shoppingList: {
      items: [
        { id: '1', done: true },
        { id: '2', done: false },
      ],
    },
  } as RootState;
  expect(selectProgress(state)).toBe(0.5);
});
```

### Komponenten testen

Presentational-Komponenten testen ohne Store. Container-Komponenten mit einem echten Store (nicht mocken — der Store ist Teil des Vertrags).

```tsx
test('ShoppingListItem zeigt Name und reagiert auf Tap', () => {
  const onCheck = vi.fn();
  render(<ShoppingListItem item={mockItem} onCheck={onCheck} />);
  fireEvent.click(screen.getByText('Milch'));
  expect(onCheck).toHaveBeenCalledWith('item-1');
});
```

---

## Häufige Anti-Patterns

| Anti-Pattern | Problem | Stattdessen |
|---|---|---|
| `useState` + `useEffect` zum Daten laden | Race Conditions, Loading-States, Cleanup vergessen | Route Loader + Redux |
| `useEffect` um State abzuleiten | Unnötiger Re-Render-Zyklus | Berechnung im Render oder Selektor |
| `useEffect`-Ketten (A → B → C) | Schwer zu debuggen, mehrfache Re-Renders | Alles in einem Reducer/Thunk |
| Business-Logik in Komponenten | Nicht testbar, dupliziert sich | In den Reducer verlagern |
| Prop Drilling über 3+ Ebenen | Fragile Kopplung | `useAppSelector` in der Zielkomponente |
| `any` als TypeScript-Escape | Keine Typsicherheit | `unknown` + Type Guards |
| Barrel files (`index.ts`) | Verhindert Tree Shaking in Vite | Direkte Imports |
| Großer monolithischer Selektor | Re-Render bei jeder Änderung | Mehrere kleine, fokussierte Selektoren |
