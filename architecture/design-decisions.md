# Design Decisions — ShopZebra

Technologie-Entscheidungen und deren Begründung. Für die zugrundeliegenden Architektur-Prinzipien siehe [design-principals.md](./design-principals.md), für konkrete Umsetzungs-Patterns siehe [react-best-practices.md](./react-best-practices.md).

---

## Frontend-Technologien

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

### Kein Immer — Immutability muss sichtbar sein

Redux Toolkit verwendet standardmäßig Immer, das mutative Syntax erlaubt: `state.items.push(item)` sieht aus wie Mutation, erzeugt aber unter der Haube ein neues Objekt. Das ist **easy, nicht simple** — es versteckt Immutability, die ein zentrales Design-Kriterium unserer Architektur ist (Values statt Objects, Events sind immutable, State ist Derived Data).

Wer `state.items.push(item)` liest, denkt "Mutation". Das widerspricht dem Intention-Revealing-Prinzip: Der Code sieht aus als würde er das Gegenteil dessen tun, was er tut.

**Unsere Lösung:** Wir verwenden Redux, aber implementieren eigene `createSlice`- und `createReducer`-Funktionen ohne Immer. Die Syntax bleibt ähnlich zu RTK, aber Reducers schreiben explizite immutable Updates:

```tsx
// Mit Immer (RTK Default) — easy, nicht simple
itemChecked(state, action: PayloadAction<{ itemId: string }>) {
  const item = state.items.find(existing => existing.id === action.payload.itemId);
  if (item) item.done = true;  // sieht aus wie Mutation
}

// Ohne Immer (unser Ansatz) — simple, intention-revealing
itemChecked(state, action: PayloadAction<{ itemId: string }>): ShoppingListState {
  return {
    ...state,
    items: state.items.map(item =>
      item.id === action.payload.itemId ? { ...item, done: true } : item
    ),
  };
}
```

Der zweite Ansatz ist mehr Code, aber er zeigt explizit: **hier wird ein neuer State erzeugt, nichts wird mutiert.** Immutability ist kein verstecktes Implementierungsdetail — sie ist sichtbar im Code.

### Capacitor — Native Shell

Mobile App mit Zugriff auf native APIs (SQLite, Kamera, Push Notifications) bei einer einzigen React-Codebase.

### Verworfene Frontend-Alternativen

**TanStack Query / React Query:**
Server ist Source of Truth → effizient lokal cachen (Fetch, SWR, Retry, Background Refetch). Unser Datenfluss ist umgekehrt: Die lokale DB ist die Source of Truth, der Server wird gesynct. TanStack Query würde eine zweite Caching-Schicht einführen, die keines unserer Probleme löst — nur Komplexität addiert. Falls wir doch Server-API-Calls brauchen (Rezept-Import per URL), nutzen wir RTK Query, das bereits in Redux Toolkit enthalten ist.

**CRDTs (Yjs, Automerge):**
Conflict-free Merge bei gleichzeitiger Bearbeitung desselben Dokuments (z.B. Text in Google Docs). Nicht gewählt weil:
1. **Overkill für unser Datenmodell.** Shopping-Listen-Konflikte sind trivial: Zwei User fügen Items hinzu → beide erscheinen. Jemand hakt ab → idempotent. Menge ändern → Last-Writer-Wins reicht. Dafür braucht man keine CRDT-Mathematik
2. **Kein DynamoDB-Support.** Yjs und Automerge bringen eigene Sync-Server mit. Die Integration mit DynamoDB müssten wir komplett selbst bauen
3. **Wachsende Dokumente.** CRDTs speichern History. Über Monate wachsen Dokumente unbegrenzt. Automerge hat ein 4GB WebAssembly-Limit. Cinapse (Terminplanungs-Software) ist aus genau diesem Grund von Automerge weggemigriert — 89% weniger Support-Tickets danach
4. **Pragmatik > Eleganz.** CRDTs passen philosophisch zum funktionalen Ansatz (Merge ist eine pure Funktion). Aber sie lösen ein Problem, das wir nicht haben, mit Komplexität, die wir nicht brauchen

**Zustand:**
Minimal und boilerplate-arm, aber kein eingebautes Event/Effect-System. Man muss die Disziplin der Architektur-Prinzipien komplett selbst durchsetzen. Redux Toolkit gibt uns die Leitplanken, die diese Prinzipien erzwingen.

---

## API-Strategie: REST

Für die Server-Kommunikation verwenden wir eine REST API (API Gateway + Lambda), keine GraphQL-API.

**Gewählt weil:**

**1. Die API ist ein Event-Transport, keine Query-Schnittstelle.**
Aus dem Event-Sourcing-Modell ergeben sich wenige, flache Endpunkte:

```
POST  /lists/{id}/events          → Event anhängen
GET   /lists/{id}/events?since=t  → Events nachholen (nach Offline)
GET   /lists/{id}                 → Materialisierten State laden
POST  /lists                      → Liste erstellen
```

Kein Client braucht verschiedene Ausschnitte aus tief verschachtelten Daten. Es gibt kein Overfetching/Underfetching-Problem, weil das Datenmodell flach ist.

**2. Simple Made Easy.**
GraphQL bringt vier verwobene Konzepte die keines unserer Probleme lösen:
- Schema Definition Language — eine eigene Sprache
- Resolvers — eine eigene Ausführungsschicht auf dem Server
- Query-Konstruktion auf dem Client — der Client muss Queries formulieren
- Codegen — in der Praxis braucht man `graphql-codegen` für TypeScript-Types

Ein REST-Call in einem Thunk:
```ts
const response = await fetch(`/lists/${listId}/events`, { method: 'POST', body: event });
```

Ein GraphQL-Call für denselben Effekt:
```ts
const result = await client.mutate({
  mutation: gql`mutation AppendEvent($input: EventInput!) {
    appendEvent(input: $input) { id timestamp }
  }`,
  variables: { input: event }
});
```

Gleicher Effekt. Mehr Syntax. Mehr Konzepte. Kein Mehrwert.

**3. Local-first macht GraphQL's Kernvorteil irrelevant.**
Die lokale DB ist die Source of Truth. Der Client fragt den Server fast nie nach Daten für die Anzeige — die kommen aus SQLite → Redux Store → Selektoren → UI. GraphQL's Stärke "fetch genau was du für diesen Screen brauchst" greift nicht, wenn Screens nicht vom Server fetchen.

**4. RTK Query ist REST-nativ.**
RTK Query ist für REST designed. Endpoints, Cache-Tags, Invalidierung — alles mappt 1:1 auf REST-Endpunkte.

**5. AppSync Events ist kein Argument für AppSync GraphQL.**
AppSync Events und AppSync GraphQL sind zwei getrennte Produkte unter demselben Brand. AppSync GraphQL bringt ein eigenes Programmiermodell mit (VTL/JS-Resolver, Schema-Definition). Das wäre kein "unter einem Dach" sondern zwei verschiedene Systeme.

### Verworfen — GraphQL

| GraphQL-Vorteil | Relevant für ShopZebra? |
|---|---|
| Verschiedene Clients brauchen verschiedene Daten-Shapes | Nein — ein Client, ein Datenmodell |
| Tief verschachtelte Daten effizient laden | Nein — flaches Event-Modell |
| API-Evolution ohne Versionierung | Nein — Event-Schema ist append-only |
| Schema als Doku und Kontrakt | Ja, aber OpenAPI/TypeScript-Types leisten dasselbe |
| Subscriptions für Real-time | Bereits über AppSync Events gelöst |

---

## Sync-Architektur: Event Sourcing mit DynamoDB

Für Echtzeit-Kollaboration (mehrere Familienmitglieder auf derselben Liste) verwenden wir Event Sourcing — das ist der funktionale Ansatz für verteilte Systeme.

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
  → Thunk: schreibt Event via REST API in DynamoDB Events-Table
  → Lambda published Event auf AppSync Events Channel "lists/{listId}"
  → AppSync Events: pusht an alle Subscriber des Channels
  → Mamas Redux Store: dispatch(itemChecked({listId, itemId}))
  → Mamas UI: Milch ist abgehakt
```

### Architektur-Schichten

```
┌─────────────────────────────────────────┐
│              DynamoDB                    │
│   Events-Table      State-Table         │
│   (append-only)     (materialized view) │
└────────┬────────────────────────────────┘
         │
    REST API (API Gateway + Lambda)
         │
         ├─ schreibt Event in DynamoDB
         └─ published Event auf AppSync Events
                      │
              Channel: lists/{listId}
                      │
                ┌─────┴─────┐
                ▼           ▼
              Papa        Mama
              Redux       Redux
              Store       Store
```

### Warum Event Sourcing passt

- **Events sind immutable Values** — Kernforderung des Simple-Made-Easy-Prinzips
- **State ist Derived Data** — re-frame-Prinzip, über die Netzwerkgrenze hinweg
- **DynamoDB Streams verfügbar** — können für event-driven Verarbeitung genutzt werden (Backend-Design noch nicht finalisiert)
- **Offline-fähig**: Events werden lokal in SQLite gequeued, beim Reconnect gesendet
- **Vollständig nachvollziehbar**: Wer hat wann was geändert (Activity Feed ist gratis)
- **Conflict Resolution ist trivial**: Events werden append-only geschrieben. Reihenfolge per Timestamp + Device-ID. Keine Merge-Konflikte
- **Testbar**: Event-Replay in Tests reproduziert jeden Zustand deterministisch

### Real-time Transport: AppSync Events

Für die Echtzeit-Zustellung von Events an andere Clients verwenden wir **AWS AppSync Events** — einen managed Pub/Sub-Service mit serverless WebSockets.

**Gewählt weil:**
- **Kein Connection Management.** AppSync managed Verbindungen, Fan-out und Cleanup. Keine DynamoDB-Connections-Table, keine Fan-out-Lambda, kein Stale-Connection-Cleanup nötig
- **Standard WebSocket.** Client verbindet sich per WebSocket oder Amplify-SDK — kein spezielles Protokoll wie MQTT nötig. Natürlich für React/Capacitor-Apps
- **Channel-basiertes Pub/Sub.** Clients subscriben auf `lists/{listId}`. AppSync verteilt Events automatisch an alle Subscriber. Namespace-Wildcards eingebaut
- **Minimale Integration.** Eine Zeile Publish in bestehenden REST-Lambdas: `appsync.publish({ channel, events })`
- **Bidirektional seit März 2025.** Clients können über dieselbe WebSocket-Verbindung publishen und subscriben
- **Kosten.** $0.08/Mio Connection-Minutes, $1.00/Mio Operations. Bei 1.000 Familien unter $5/Monat

#### Verworfene Alternativen für Real-time Transport

**API Gateway WebSocket:**
Die naheliegendste Lösung, aber mit erheblichem Eigenaufwand:
1. Connection Management Table in DynamoDB nötig (welcher User auf welcher connectionId, welche Listen)
2. Fan-out-Lambda nötig (Query Connections → `postToConnection()` pro Client → 410 GoneException bei stale Connections behandeln)
3. Stale Connection Cleanup selbst implementieren (API Gateway trennt nach 10 Min Idle / 2h max)
4. Kein Broadcast — jede Nachricht muss einzeln an jede Connection gesendet werden
5. Teurer: $0.25/Mio Connection-Minutes (3x AppSync Events)

Funktioniert, aber man baut Infrastruktur die AppSync Events out-of-the-box liefert.

**AWS IoT Core (MQTT):**
Wird von manchen als WebSocket-Ersatz genutzt (z.B. in Lambda-Live-Debugging-Tools). Topic-basiertes Pub/Sub mit managed Fan-out — eliminiert wie AppSync Events das Connection Management.

Vorteile gegenüber AppSync Events:
- Retained Messages (neuer Subscriber kriegt letzten State sofort)
- Last Will & Testament (automatische Offline-Erkennung)
- Rules Engine kann direkt in DynamoDB schreiben ohne Lambda
- Keep-alive Pings sind gratis

Nicht gewählt weil:
- MQTT-Protokoll erfordert `aws-iot-device-sdk` im Client — auf IoT-Devices ausgerichtet, nicht auf Browser/Apps
- Doku, Beispiele und CDK-Constructs sind auf Sensor-/Device-Use-Cases zugeschnitten
- Zweckentfremdung eines IoT-Services für App-Messaging. Funktioniert, ist aber nicht der intended Use Case

**Polling / Push Notification + Pull:**
Polling alle paar Sekunden ist verschwenderisch und hat trotzdem Latenz. Push Notifications (FCM/APNs) als Trigger für Pull funktioniert im Hintergrund, aber nicht für aktive In-App-Nutzung: Push hat keine Delivery-Garantie, wird gebatched (Doze Mode), und ist für Background-Wakeups gedacht. Wenn jemand aktiv mit offener App im Supermarkt steht, gibt es keinen sinnvollen Weg um eine persistente Verbindung herum.
