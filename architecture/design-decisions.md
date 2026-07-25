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

Mobile App mit Zugriff auf native APIs (Filesystem, Kamera, Push Notifications) bei einer einzigen React-Codebase.

**Storage-Entscheidung (2026-07-25): kein SQLite.** Alle Reads laufen aus Redux im Speicher — es gibt keine Queries, keine Indizes, keine partiellen Reads. Persistenz ist reines „Blob schreiben, beim Start laden": JSON-Blobs via **Capacitor Filesystem** (offizielles Plugin, atomar per write-temp-then-rename), **Preferences** nur für Kleinkram (Theme, Cursor — Android SharedPreferences hat ein ~1-MB-Praxislimit). `@capacitor-community/sqlite` (Community-Plugin, SQL-Layer, Migrationen, sql.js/WASM im Browser) wäre Maschinerie für ein Problem, das wir nicht haben. Neu bewerten, falls die Kaufhistorie-Suche (Smart Features) echte Queries braucht — die Wahl liegt hinter der `clientStorage`-Grenze und ist austauschbar.

### Verworfene Frontend-Alternativen

**TanStack Query / React Query:**
Server ist Source of Truth → effizient lokal cachen (Fetch, SWR, Retry, Background Refetch). Unser Datenfluss ist umgekehrt: Die lokale DB ist die Source of Truth, der Server wird gesynct. TanStack Query würde eine zweite Caching-Schicht einführen, die keines unserer Probleme löst — nur Komplexität addiert. Falls wir doch Server-API-Calls brauchen (Rezept-Import per URL), nutzen wir RTK Query, das bereits in Redux Toolkit enthalten ist.

**CRDT-Libraries (Yjs, Automerge) — und CRDT-Semantik überhaupt:**
Conflict-free Merge bei gleichzeitiger Bearbeitung desselben Dokuments (z.B. Text in Google Docs). Verworfen sind sowohl die Library als auch das Prinzip:
1. **Overkill für unser Datenmodell.** Shopping-Listen sind kein kollaborativer Rich-Text
2. **Kein DynamoDB-Support.** Yjs und Automerge bringen eigene Sync-Server mit. Die Integration mit DynamoDB müssten wir komplett selbst bauen
3. **Wachsende Dokumente.** CRDTs speichern History. Über Monate wachsen Dokumente unbegrenzt. Automerge hat ein 4GB WebAssembly-Limit. Cinapse (Terminplanungs-Software) ist aus genau diesem Grund von Automerge weggemigriert — 89% weniger Support-Tickets danach
4. **Wir brauchen keine ordnungsunabhängigen Merges.** CRDTs sind die richtige Antwort für Systeme *ohne* zentrale Ordnung (P2P, Multi-Master). Wir haben mit dem DynamoDB-Append eine ULID und damit eine Total Order. Die von Hand nachgebaute CRDT-Semantik (LWW-Register, OR-Set, HLC) hätte auf dem Client Maschinerie errichtet, um eine bereits vorhandene Ordnung *nicht* nutzen zu müssen — siehe [conflict-resolution.md](./conflict-resolution.md) §4

**Fertige Sync Engines (Zero, ElectricSQL, PowerSync, Replicache):**
Architektonisch liegen wir in derselben Familie wie Replicache und Linear — optimistic local write, server-geordnetes Log, Client-Rebase. Trotzdem übernehmen wir keine fertige Engine: Zero, ElectricSQL und PowerSync sind **Postgres-zentriert** — sie zu nutzen hieße DynamoDB, AppSync, die Rust-Lambdas *und* Event Sourcing aufzugeben, und damit den Activity Feed, der bei uns als Projektion über den Log gratis abfällt. **Replicache** wäre backend-agnostisch (eigene Push/Pull-Endpunkte, DynamoDB möglich), ist aber im Maintenance-Modus — Rocicorp entwickelt mit Zero einen Nachfolger. Das ist kein Nachrüsten, das ist ein anderes Produkt bzw. ein abgekündigtes Fundament.

Für ein flaches Datenmodell mit rund zwölf Event-Typen ist der Eigenbau kleiner als der Umstieg. Der Aufbau steht in [sync-engine.md](./sync-engine.md).

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
Der lokale Store ist die Source of Truth. Der Client fragt den Server fast nie nach Daten für die Anzeige — die kommen aus clientStorage → Redux Store → Selektoren → UI. GraphQL's Stärke "fetch genau was du für diesen Screen brauchst" greift nicht, wenn Screens nicht vom Server fetchen.

**4. RTK Query ist REST-nativ.**
RTK Query ist für REST designed. Endpoints, Cache-Tags, Invalidierung — alles mappt 1:1 auf REST-Endpunkte.

**5. AppSync Events ist kein Argument für AppSync GraphQL.**
AppSync Events und AppSync GraphQL sind zwei getrennte Produkte unter demselben Brand. AppSync GraphQL bringt ein eigenes Programmiermodell mit (VTL/JS-Resolver, Schema-Definition). Das wäre kein "unter einem Dach" sondern zwei verschiedene Systeme.

### Zwei Arten von Endpunkten: Events und Commands

Die API ist überwiegend Event-Transport — aber nicht ausschließlich. Nicht jede Nachricht darf denselben Weg nehmen:

**Klasse 1 — Event-Append (generisch).** `itemChecked`, `listRenamed`, `recipeCreated` und der große Rest. Keine Invariante über Nutzer hinweg: Wer Mitglied des Aggregates ist, darf sie senden. Der Server prüft Auth, Membership und Wohlgeformtheit des Envelopes, vergibt eine ULID, hängt an und broadcastet. Er interpretiert das Payload nicht. **Ein Lambda für alle Event-Typen** — ein neues Feature kostet keine Backend-Änderung.

**Klasse 2 — Commands.** Invite-Erzeugung (Owner-only), `listMemberAdded` (Invite-Token einlösen), `listMemberRemoved`, Rezept-Import per URL. Echte fachliche Invarianten, echte Außenwirkung (Mail, ausgehender Fetch, Zugriffsvergabe). Eigener Endpunkt, eigenes Lambda, Server validiert und **schreibt das resultierende Event selbst** in den Log. Der Client schlägt vor, der Server verfügt.

Die Linie: *Hat es eine nutzerübergreifende Invariante oder eine Außenwirkung?* → Klasse 2. Sonst Klasse 1.

Das ist keine Aufweichung des dummen Backends, sondern seine Präzisierung: **Das Gate kennt die Regeln, der Log kennt nichts.** Der Store bleibt append-only und uninterpretierend. Und die Klasse-2-Liste wächst nicht mit der Feature-Zahl — sie umfasst Identität, Zugriff und externe Effekte, nicht die Domäne.

Der Grund, warum das nicht optional ist: Membership wird aus dem Log abgeleitet. Dürfte ein Client `listMemberAdded` selbst appenden, stammte die Autorisierungsgrundlage aus genau dem Stream, den die Autorisierung schützen soll. Siehe [sync-engine.md](./sync-engine.md) §6.

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
  → Sofort sichtbar (optimistic) + Event landet in der Outbox
  → Transport: POST /lists/{id}/events
  → Lambda: Envelope validieren, ULID vergeben, appenden
  → Lambda published Event auf AppSync Events Channel "lists/{listId}"
  → AppSync Events: pusht an alle Subscriber des Channels
  → Papas Gerät:  Bestätigung — Event verlässt die Outbox, Rebase
  → Mamas Gerät:  Event nach ULID einsortieren, falten, eigene Pending replayen
  → Mamas UI: Milch ist abgehakt
```

### Architektur-Schichten

```
┌─────────────────────────────────────────┐
│              DynamoDB                    │
│   Events-Table      Snapshot-Table      │
│   (append-only,     (opaker Cache,      │
│    ULID = Ordnung)   client-erzeugt)    │
└────────┬────────────────────────────────┘
         │
    REST API (API Gateway + Lambda)
         │
         ├─ Klasse 1: Envelope prüfen, ULID vergeben, appenden
         ├─ Klasse 2: Fachlogik prüfen, Event selbst schreiben
         └─ published Event auf AppSync Events
                      │
              Channel: lists/{listId}
                      │
                ┌─────┴─────┐
                ▼           ▼
              Papa        Mama
           confirmed    confirmed
           + pending    + pending
```

### Warum Event Sourcing passt

- **Events sind immutable Values** — Kernforderung des Simple-Made-Easy-Prinzips
- **State ist Derived Data** — re-frame-Prinzip, über die Netzwerkgrenze hinweg
- **DynamoDB Streams verfügbar** — können für event-driven Verarbeitung genutzt werden (Backend-Design noch nicht finalisiert)
- **Offline-fähig**: Events sammeln sich lokal in einer Pending-Queue und werden beim Reconnect gesendet
- **Vollständig nachvollziehbar**: Wer hat wann was geändert (Activity Feed ist gratis — er *ist* der bestätigte Log)
- **Conflict Resolution über die Log-Reihenfolge**: Append-only entfernt Write-Write-Konflikte auf Speicher-Ebene. Semantische Konflikte (gleichzeitige Änderung desselben Feldes) bleiben und werden dadurch aufgelöst, dass der Server beim Append eine **ULID** vergibt und alle Clients das Log in genau dieser Reihenfolge falten. Konvergenz per Konstruktion — keine Feld-Versionen, keine HLC, kein LWW. Details: [conflict-resolution.md](./conflict-resolution.md)
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
