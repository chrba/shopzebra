# Sync Engine — ShopZebra

Wie lokale Änderungen zum Server und zu den anderen Geräten kommen. Für die Frage, *wie Konflikte entschieden werden*, siehe [conflict-resolution.md](./conflict-resolution.md); für die Technologiewahl [design-decisions.md](./design-decisions.md); für das Datenmodell [domain-model.md](./domain-model.md).

---

## 1. Der ganze Mechanismus in einer Zeile

```
visibleState = fold(rootReducer, fold(rootReducer, confirmed, serverLog), pending)
```

Der Client hält zwei Stände: den **bestätigten** State (alles, was der Server geordnet hat) und eine **Pending-Queue** eigener, noch unbestätigter Events. Was die UI sieht, ist der bestätigte State mit den Pending-Events obendrauf. Trifft eine Bestätigung ein, wird sie in den bestätigten State gefaltet und die verbleibenden Pending-Events werden neu darübergespielt — das ist der Rebase.

Alles Weitere in diesem Dokument ist Konsequenz aus dieser Zeile.

---

## 2. Warum überhaupt eine Engine — und warum eine eigene

### Was heute existiert

`syncMiddleware.ts` iteriert über eine Handler-Liste, `listsSyncHandler.ts` ist eine Kette aus `if (actionCreator.match(action))` mit einem `fetch` pro Action, und das Ergebnis wird mit `void promise` verworfen. Es gibt keine Queue, kein Retry, kein Ack, keinen Cursor, kein Nachholen beim Reconnect.

Das ist **optimistic UI + Best-Effort-POST**, nicht offline-first. Die Bruchstücke einer Sync Engine sind da, aber ohne Grenze und über Features verteilt.

### Warum das die falsche Form ist

Der ganze Wert einer Sync Engine liegt darin, dass sie **domänen-agnostisch** ist: einmal gebaut, kostet ein neuer Event-Typ null Zeilen Sync-Code. Der heutige Pfad kostet pro Action ein `if` plus eine Funktion — mal fünf geplante Domänen (shopping, recipes, meal-plan, activity, preferences).

Dabei liegt die Voraussetzung schon vor: Das Wire-Format ist bereits uniform. `{ type, payload }` ist gleichzeitig Redux Action, Domain Event und Wire Format (siehe [domain-model.md](./domain-model.md) §8). Diese Uniformität ist unsere größte Stärke und wird gerade nicht genutzt.

### Warum keine fertige Engine

| Familie | Vertreter | Konfliktlösung |
|---|---|---|
| Row-/State-Replikation | ElectricSQL (Shapes), PowerSync, RxDB | LWW pro Row oder Hook |
| Query-basiert | Zero (Rocicorp) | Server re-runt den Mutator |
| Mutation-Log + Server-Reconciliation | Replicache, Linear LSE | Server-Order + Client-Rebase |
| CRDT | Yjs, Automerge, Loro | kommutativer Merge, keine zentrale Order |

Wir sind architektonisch **Familie 3** — optimistic local write, Server-Append mit ULID, Broadcast, Fold beim Empfänger. Das ist Server-Reconciliation in Event-Sourcing-Vokabular.

Verworfen wurde, eine fertige Engine zu übernehmen: Electric, PowerSync und Zero sind Postgres-zentriert — sie zu nutzen hieße DynamoDB, AppSync, die Rust-Lambdas *und* Event Sourcing aufzugeben, und damit den Activity Feed, der bei uns als Projektion über den Log gratis abfällt. Replicache wäre backend-agnostisch (eigene Push/Pull-Endpunkte, DynamoDB möglich), ist aber im Maintenance-Modus — Rocicorp entwickelt mit Zero einen Nachfolger. Auf eine abgekündigte Engine zu setzen ist kein tragfähiges Fundament. Für ein flaches Datenmodell mit rund zwölf Event-Typen ist der Eigenbau kleiner als der Umstieg.

---

## 3. Der Kern: ein Higher-Order Reducer, keine zweite Maschine

Die Rebase-Logik gehört **nicht** in Middleware. Sie ist eine pure Funktion über Values — also ein Reducer. Und zwar derselbe Konstrukt-Typ wie unser eigenes `createSlice` ohne Immer.

```ts
// app/sync/syncReducer.ts
type SyncState<S> = {
  readonly confirmed: S                               // fold(Server-Log)
  readonly pending: readonly PayloadAction<unknown>[] // lokal, unbestätigt
  readonly cursor: string | null                      // letzte gefaltete ULID
  readonly visible: S                                 // was Selektoren lesen
}

export function withSync<S>(rootReducer: Reducer<S>) {
  return (state: SyncState<S>, action: AnyAction): SyncState<S> => {
    if (eventsConfirmed.match(action)) {
      const incoming = [...action.payload.events].sort(byUlid)
      const confirmed = incoming.reduce(rootReducer, state.confirmed)
      const acked = new Set(incoming.map((event) => event.meta.eventId))
      const pending = state.pending.filter((event) => !acked.has(event.meta.eventId))
      return {
        confirmed,
        pending,
        cursor: incoming.at(-1)?.meta.ulid ?? state.cursor,
        visible: pending.reduce(rootReducer, confirmed),   // ← der Rebase
      }
    }

    const visible = rootReducer(state.visible, action)     // optimistic
    return isSynced(action)
      ? { ...state, visible, pending: [...state.pending, action] }
      : { ...state, visible, confirmed: rootReducer(state.confirmed, action) }
  }
}
```

Der Rebase ist eine Zeile: `pending.reduce(rootReducer, confirmed)`.

**Invariante: `confirmed` ist „lokale Wahrheit ohne Pending", nicht „der Server-Log".** Nicht-gesyncte Actions (Preferences, Theme) werden deshalb auf *beide* Bäume angewandt. Würden sie nur `visible` erreichen, verschwände jede nicht-gesyncte Änderung beim nächsten Rebase — denn dort wird `visible` vollständig aus `confirmed + pending` neu berechnet.

**Die Feature-Reducer bleiben unverändert** — plain values, deterministische Folds, kein Wissen darüber, dass es Sync gibt. Es gibt keinen Conflict-Resolver, keine Merge-Tabelle, keine Feld-Versionen.

Middleware macht danach nur noch das, wofür Re-frame sie vorsieht: **Effects**. Pending rausschicken, Bestätigungen reinreichen. Null Fachlichkeit.

### Wie die Engine domänen-agnostisch bleibt

`isSynced` ist die einzige Policy-Frage. Sie gehört nicht in eine zentrale `if`-Kette, sondern an den Slice:

```ts
const listsSlice       = createSlice({ name: 'lists',       synced: true,  ... })
const preferencesSlice = createSlice({ name: 'preferences', synced: false, ... })
```

Ein Boolean pro Slice statt ein `if` pro Action. Maßgeblich ist dabei das **Aggregate, auf dessen Log ein Event landet** — nicht das Feature, das es dispatcht: `ingredientsCheckedOut` wird von `meal-plan/` dispatcht, gehört aber zum ShoppingList-Aggregate (siehe [../services/events.md](../services/events.md)). Und die dabei entstehende Grenze ist exakt die **Domain-vs-Local-Preferences-Grenze** aus [domain-model.md](./domain-model.md) §1. Dieselbe Linie, einmal gezogen, zweimal genutzt — das ist das Zeichen, dass der Schnitt stimmt.

---

## 4. Die Bausteine

```
app/sync/
  syncReducer.ts     # Higher-Order Reducer: confirmed + pending + rebase (pure)
  outbox.ts          # Persistenz von pending + cursor über clientStorage
  transport.ts       # POST /events, GET /sync?since, AppSync-Subscribe
  syncMiddleware.ts  # nur Effects
```

| Baustein | Aufgabe |
|---|---|
| **Outbox** | Jede synced, nicht-remote `PayloadAction` anhängen und über `clientStorage` persistieren (überlebt App-Neustart) |
| **Transport** | `POST /events` gebatcht, Retry mit Backoff, idempotent über `meta.eventId` |
| **Cursor** | Letzte bestätigte ULID persistieren; beim Reconnect `GET /sync?since=<ulid>` |
| **Empfang** | AppSync-Subscribe, eingehende Events nach ULID sortieren, Dedup per `eventId` |
| **Rebase** | Siehe §3 — im Reducer, nicht in der Middleware |

**Ablehnung statt Endlos-Retry:** Retry gilt nur für Netzwerk- und 5xx-Fehler. Lehnt der Server ein Event fachlich ab (4xx — ungültiger Envelope, fehlende Membership, gelöschtes Aggregate), verlässt es die Outbox **endgültig** und wird auch aus `pending` entfernt — sonst blockiert ein einzelnes abgelehntes Event die Queue für immer. Ob und wie der Nutzer über verworfene Offline-Änderungen informiert wird, ist eine offene UX-Frage.

**Persistenz:** Neben `pending` und `cursor` muss auch `confirmed` persistiert werden (oder per Snapshot + Log rekonstruierbar sein) — ohne bestätigten Ausgangszustand ist nach einem App-Neustart kein Rebase möglich.

### Mobile-Constraints (Android/iOS)

Die App läuft nativ via Capacitor — zwei Konsequenzen für die Engine:

- **Storage:** `clientStorage` schreibt JSON-Blobs via **Capacitor Filesystem** (atomar: write-temp-then-rename), z.B. eine Datei pro Aggregate-State plus Outbox-Datei. **Preferences nur für Kleinkram** (Theme, Cursor) — Android SharedPreferences hat ein ~1-MB-Praxislimit und wird komplett in den Speicher geladen. Kein SQLite (Begründung: [design-decisions.md](./design-decisions.md)).
- **Reconnect-Trigger sind Pflicht-Bausteine, nicht Nice-to-have:** Android (Doze) killt die WebSocket-Verbindung im Hintergrund. Nach **App-Resume** (`appStateChange`-Listener) und **Network-Change** (Capacitor Network Plugin) gilt immer: AppSync neu subscriben, `GET /sync?since=<cursor>` nachholen, Outbox flushen. Die Subscription allein reicht als Empfangspfad nie aus — der Cursor-Catch-up ist der verlässliche Pfad, AppSync nur die Latenz-Optimierung.

Liegt in `app/`, unabhängig davon, wie die Struktur-Frage aus [refactoring.md](./refactoring.md) entschieden wird. Kein Feature importiert daraus.

---

## 5. Constraint: Reducer müssen replay-pur sein

Beim Rebase wird mehrfach gefaltet. Jedes Replay muss dasselbe Ergebnis liefern — sonst springt die UI bei jeder eintreffenden Bestätigung.

**Verboten im Reducer:** `Date.now()`, `crypto.randomUUID()`, `Math.random()`, jeder Zugriff auf Umgebungszustand.

IDs und Timestamps entstehen in der **Middleware** und reisen im Event mit. `eventIdMiddleware` etabliert das Muster bereits (`eventId`, `deviceId`); es muss ausnahmslos gelten. Diese Regel ist unter Rebase schärfer als bei einmaligem Anwenden jedes Events und ist deshalb hier als Constraint festgehalten.

**Reducer müssen außerdem total sein.** Ein Event, das im aktuellen State nicht anwendbar ist, wird ignoriert — nie geworfen. Beim Rebase ist das der Normalfall (ein pending `itemAdded` trifft auf eine inzwischen bestätigte `listDeleted`), und zugleich ist es die letzte Verteidigung gegen kaputte Payloads: Der Log ist unveränderlich — ein Event, das den Fold crasht, würde das Aggregate sonst für alle Geräte dauerhaft unbrauchbar machen.

---

## 6. Backend: Gate kennt die Regeln, Log kennt nichts

Der Event Store bleibt append-only und uninterpretierend. Davor sitzt ein Gate, das Regeln durchsetzt. Diese Trennung ist entscheidend: Validierung macht den Log nicht klüger.

### Zwei Klassen von Nachrichten

**Klasse 1 — kollaborative Domain-Events.** `itemAdded`, `itemChecked`, `listRenamed`, `recipeCreated`, `recipeAssigned`, `messageSent`. Keine Invariante über Nutzer hinweg. Wer Mitglied des Aggregates ist, darf sie senden. Das Backend prüft Auth + Membership + Wohlgeformtheit, vergibt eine ULID, hängt an und broadcastet. Semantik interpretiert es nicht. **Ein generisches Lambda für alle**, kein Deploy pro Event-Typ.

**Klasse 2 — sicherheitsrelevante Commands.** Invite-Erzeugung (Owner-only), `listMemberAdded` (Invite-Token einlösen), `listMemberRemoved`, Rezept-Import per URL. Echte Invarianten, echte Außenwirkung. Diese gehen **nicht** durch den Event-Append-Pfad: eigener Endpunkt, eigenes Lambda, Server validiert, Server entscheidet, und **der Server schreibt das resultierende Event in den Log**. Der Client schlägt vor, der Server verfügt.

Die Linie: *Hat es eine nutzerübergreifende Invariante oder eine Außenwirkung?* → Klasse 2. Sonst Klasse 1.

Klasse 2 umfasst rund vier Endpunkte und **wächst nicht mit der Feature-Zahl**. Das rechtfertigt die Trennung: Das Backend kennt **Identität und Zugriff** — klein, stabil, sicherheitskritisch. Es kennt **nicht** Mengen, Check-States, Rezeptinhalte, Wochenplan-Slots — groß, schnell wachsend, ohne nutzerübergreifende Invarianten.

Die Klassifikation pro Event steht in [../services/events.md](../services/events.md).

### Wohlgeformtheit ohne Deploy pro Event-Typ

Für Klasse 1 braucht der Server einen Begriff von „wohlgeformt", aber kein Domänenwissen:

1. **Envelope-Validierung** — `type` in einer Allowlist, `aggregateId` stimmt mit dem Pfad überein, Payload unter n KB, gültiges JSON. Reicht als Start.
2. **JSON-Schema-Registry** — Schemas liegen als Daten in DynamoDB/S3, ein generischer Validator lädt sie. Neuer Event-Typ = Schema hochladen, kein Rust-Deploy. Nicht bloß Defense in depth: Der Log ist unveränderlich, und der Server kann kaputte Events nachträglich nicht reparieren — ein Payload, der den Fold bricht, vergiftet das Aggregate für alle Geräte dauerhaft. Spätestens nötig, bevor fremde Geräte den Log falten; bis dahin ist die Totalitäts-Regel der Reducer (§5) die einzige Verteidigung. Ein Redaction-/Skip-Mechanismus für bereits vergiftete Einträge ist ein offener Punkt.
3. *Verworfen:* `enum EventData { ListCreated(...) }` wie heute in `event-handler/src/handler.rs` — Deploy pro Event-Typ.

Das Backend kennt damit die **Form** der Events, nicht ihre **Bedeutung**. Diese Linie ist der Unterschied zwischen „validiert" und „gekoppelt".

Dazu gehören Rate Limiting pro User (API-Gateway-Usage-Plan) und ein Payload-Cap. Ein append-only Log, in den Clients schreiben, ist sonst ein unbegrenzter Storage- und Fold-Angriff.

### ULID-Vergabe: pro Aggregate streng monoton

Der Cursor-Mechanismus (`GET /sync?since=<ulid>`) funktioniert nur, wenn nie ein Event mit *kleinerer* ULID geschrieben wird, nachdem Clients ihren Cursor bereits dahinter weitergezogen haben. ULIDs sind zeitstempel-basiert — parallele Lambda-Instanzen mit Uhren-Drift können diese Annahme verletzen. Das betroffene Event würde von `?since` nie mehr geliefert und wäre für alle nachholenden Clients dauerhaft unsichtbar.

Deshalb erzwingt der Append die Monotonie: Conditional Put nur, wenn die neue ULID größer als die letzte SK des Aggregates ist — andernfalls ULID neu erzeugen und erneut versuchen. (Ein Überlappungsfenster bei der Sync-Query wäre die Alternative, verlagert die Komplexität aber in jeden Lese-Pfad.)

### Membership ist eine Server-Projektion

Wichtig genug für einen eigenen Absatz: Membership darf **nicht** aus client-geschriebenen Events abgeleitet werden. Sonst stammt die Autorisierungsgrundlage aus genau dem Stream, den die Autorisierung schützen soll — und ein Client verschafft sich per `listMemberAdded { listId: <fremde Liste>, memberId: <ich> }` selbst Zugriff.

Der Server besitzt die Membership-Projektion — **pro Aggregate** (`(aggregateId, userId)`-Paare). Alle Zugriffsänderungen laufen über Klasse-2-Commands.

**Owner-Modell (entschieden 2026-07-25):** Es gibt kein Familien-Konzept. Eine Liste hat einen **Owner** (ihren Ersteller); nur er erzeugt Invites und entfernt Mitglieder, jedes Mitglied kann sich selbst entfernen. Membership existiert ausschließlich pro Liste.

---

## 7. Snapshots: Fachlogik genau einmal

Ein neues Gerät soll nicht den gesamten Log falten müssen. Der naheliegende Weg — ein Rust Stream Processor materialisiert eine State-Table — hat einen versteckten Preis: Er müsste **alle Reducer in Rust nachbauen**. Zwei Sprachen, eine Semantik, für immer synchron zu halten.

Stattdessen: **Snapshots sind opake Blobs, erzeugt vom Client.**

```
Client faltet ohnehin → lädt periodisch fold(log) als JSON hoch,
getaggt mit der ULID, bis zu der gefaltet wurde.
Server speichert es, ohne es zu interpretieren.

Neues Gerät: Snapshot laden → GET /sync?since=<snapshot.ulid> → falten → fertig.
```

Damit gibt es die Fachlogik **genau einmal, in TypeScript**.

**Sicherheits-Constraint:** Der Snapshot ist reiner Performance-Cache, nie autoritativ. Ein kompromittierter Client könnte sonst den Bootstrap aller anderen vergiften. Jeder Client muss ihn gegen den Log nachrechnen können; im Zweifel verwerfen und neu falten.

**Trade-off:** Serverseitige Queries oder Analytics über den materialisierten State sind damit ausgeschlossen. Brauchen wir heute nicht, aber es ist eine bewusste Einbahnstraße.

Snapshots werden **zuletzt** gebaut — vorher schlicht alles falten.

---

## 8. Was das kostet

Ehrlich benannt, damit es später niemanden überrascht:

- **Zwei State-Bäume im Speicher** (`confirmed` und `visible`). Bei einer Einkaufsliste irrelevant, aber es steht da.
- **Sichtbarer Sprung beim Rebase**, wenn ein fremdes Event unter eigene Pending-Events rutscht.
- **Offline-Gewinner ist „last sync wins"** — ein Offline-Edit von 14:00 schlägt einen Online-Edit von 15:00, wenn er um 16:00 synct. Für nebenläufige Offline-Edits existiert allerdings keine echte kausale Ordnung; jede Wahl ist willkürlich, und der Fehler ist mit einem Tap korrigiert.
- **Replay-Purity** der Reducer als dauerhafte Disziplin (§5).
- **Keine serverseitige Sicht auf den State** (§7).

---

## 9. Reihenfolge

| # | Schritt | Abhängig von |
|---|---|---|
| 1 | Membership-Loch schließen (Klasse-2-Endpunkt) | — |
| 2 | `listUpdated` in Intention-Events zerlegen | 1 |
| 3 | `eventIdMiddleware` überspringt `fromServer`-Actions | — |
| 4 | Backend: PK auf `LIST#{listId}`, ULID als SK, Envelope-Validierung, Dedup, Publish | — |
| 5 | **Outbox + Cursor + Retry** — erstmals echt offline-fähig, kein Designrisiko | 3, 4 |
| 6 | **Property-Tests** — Konvergenz (fold in ULID-Ordnung), Rebase, Ack/Dedup, Totalität | 5 |
| 7 | **`withSync`** — Konvergenz-Garantie | 5, 6 |
| 8 | Snapshots | 7 |

Schritte 1 und 3 sind unabhängig von allem anderen und können sofort losgehen. Schritt 1 ist ein bestehender Sicherheitsdefekt, kein Umbau.

---

## 10. Zusammenfassung

- Wir bauen eine eigene Sync Engine der Familie **Mutation-Log + Server-Reconciliation** (Replicache/Linear). Fertige Engines scheiden aus — Postgres-zentriert (Electric, PowerSync, Zero) oder abgekündigt (Replicache).
- Der Mechanismus ist **`fold`, zweimal angewandt**: bestätigter State aus dem server-geordneten Log, Pending-Events obendrauf. Rebase ist eine Zeile im Reducer, nicht eine Maschinerie in der Middleware.
- Feature-Reducer bleiben **unverändert** und wissen nichts von Sync. Ein neues Feature kostet null Zeilen Sync-Code — nur `synced: true` am Slice.
- Das Backend trennt **Klasse 1** (generisch appenden) von **Klasse 2** (validieren, entscheiden, selbst schreiben). Gate kennt die Regeln, Log kennt nichts.
- Fachlogik existiert **genau einmal, in TypeScript** — kein Rust-Fold, Snapshots sind opake Caches.
