# Backend Events — ShopZebra

Alle Domain Events die das Backend empfängt, validiert, speichert (DynamoDB Events Table) und per AppSync an andere Clients broadcastet.

Wire Format = Redux Action = Domain Event. Kein Mapping-Layer.

```json
{ "type": "...", "payload": { ... } }
```

---

## Zwei Klassen von Nachrichten

Nicht alles darf denselben Weg nehmen. Die Klassifikation steht bei jedem Event unten; die Begründung in [sync-engine.md](../architecture/sync-engine.md) §6.

| | **Klasse 1 — Domain-Event** | **Klasse 2 — Command** |
|---|---|---|
| **Wer schreibt in den Log** | der Client (Server hängt nur an) | der **Server**, nach Validierung |
| **Server prüft** | Auth + Membership + Wohlgeformtheit | zusätzlich fachliche Invarianten |
| **Server interpretiert Payload** | nein | ja |
| **Endpunkt** | generisch, `POST /{aggregate}/{id}/events` | eigener Endpunkt, eigenes Lambda |
| **Beispiele** | `itemChecked`, `listRenamed`, `recipeCreated` | `listMemberAdded`, `listMemberRemoved` |

**Die Linie:** Hat es eine nutzerübergreifende Invariante oder eine Außenwirkung (Mail, externer Fetch, Push)? → Klasse 2. Sonst Klasse 1.

Klasse 1 läuft über **ein einziges generisches Lambda**. Validiert werden der Envelope (`type` in Allowlist, `aggregateId` stimmt mit dem Pfad überein, Payload-Größe begrenzt, gültiges JSON) **und die Payload-Form per JSON-Schema pro Event-Typ** — Schemas als Daten, zunächst ins Binary eingebettet, später in eine Registry verschiebbar ([sync-engine.md](../architecture/sync-engine.md) §6). Das Backend kennt die *Form* der Events, nicht ihre *Bedeutung*.

> ⚠️ **Klasse-2-Events dürfen von Clients nie direkt appended werden.** Membership wird aus dem Log abgeleitet; könnte ein Client `listMemberAdded` selbst schreiben, verschafft er sich per `{ listId: <fremde Liste>, memberId: <ich> }` Zugriff auf beliebige Listen. Der Server besitzt die Membership-Projektion.

---

## ShoppingList Aggregate

Aggregate-ID: `LIST#{listId}`

> **Owner-Modell (entschieden 2026-07-25):** Es gibt **kein Familien-Konzept**. Der Ersteller (`createdBy` in `listCreated`) ist **Owner** der Liste. Nur der Owner erzeugt Invites und entfernt Mitglieder; jedes Mitglied kann sich selbst entfernen. Membership existiert ausschließlich pro Liste.

| Event | Klasse |
|---|---|
| `listCreated` | **1, eigener Endpunkt** — eröffnet den Log: `POST /lists`, Server prüft `createdBy` = Aufrufer, claimt Ownership atomar und appended das Event des Clients |
| `messageSent`, `reactionAdded` | 1 |
| `listRenamed` | 1 |
| `listDeleted` | 1 |
| `listMemberAdded` | **2** |
| `listMemberRemoved` | **2** |
| `itemAdded`, `itemChecked`, `itemUnchecked`, `itemRemoved`, `itemUpdated`, `itemNoteUpdated`, `customVariantAdded` | 1 |

### listCreated
```json
{ "type": "lists/listCreated", "payload": {
    "listId": "uuid",
    "name": "Wocheneinkauf",
    "createdBy": "user-id"
}}
```

### listRenamed
```json
{ "type": "lists/listRenamed", "payload": {
    "listId": "uuid",
    "name": "Neuer Name"
}}
```

### listDeleted
```json
{ "type": "lists/listDeleted", "payload": {
    "listId": "uuid"
}}
```

### listMemberAdded — **Klasse 2**
```json
{ "type": "lists/listMemberAdded", "payload": {
    "listId": "uuid",
    "memberId": "user-id",
    "name": "Papa"
}}
```
Nicht vom Client appendbar. Entsteht serverseitig aus `POST /lists/join` (Invite-Token einlösen). Der Server prüft das Token und reichert `name` aus Cognito an — daraus beziehen Clients die Mitglieder-Anzeigedaten.

### listMemberRemoved — **Klasse 2**
```json
{ "type": "lists/listMemberRemoved", "payload": {
    "listId": "uuid",
    "memberId": "user-id"
}}
```
Nicht vom Client appendbar. Entsteht serverseitig aus `DELETE /lists/{id}/members/{memberId}` — erlaubt für den Owner (jedes Mitglied) und für ein Mitglied (sich selbst).

### itemAdded
```json
{ "type": "shopping/itemAdded", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar",
    "name": "Elstar",
    "quantity": 1,
    "unit": "kg",
    "category": "fruits-vegetables",
    "addedBy": "user-id",
    "parentId": "apples"
}}
```
`parentId` nur bei Varianten. Generische Produkte haben kein `parentId`.

### itemChecked
```json
{ "type": "shopping/itemChecked", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar",
    "checkedBy": "user-id"
}}
```

### itemUnchecked
```json
{ "type": "shopping/itemUnchecked", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar"
}}
```

### itemRemoved
```json
{ "type": "shopping/itemRemoved", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar"
}}
```

### itemUpdated
```json
{ "type": "shopping/itemUpdated", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar",
    "quantity": 3,
    "name": "Elstar"
}}
```
Felder optional — nur geänderte Felder im Payload.

> **Intention-Events, keine Full-State-Events.** Ein Event trägt nur, was sich geändert hat — nie den vollständigen neuen Zustand einer Entity. Beim Rebase wird der Pending-Stack mehrfach über den bestätigten State gespielt; ein Full-State-Event klobbert dabei zuverlässig, was zwischenzeitlich bestätigt wurde. Deshalb gibt es `listRenamed` und `listMemberAdded`/`listMemberRemoved` statt eines `listUpdated { name, memberIds }`. (`listsSlice.ts` ist seit 2026-07-25 angeglichen: `listRenamed`, Member-Änderungen nur noch über Commands.)

### itemNoteUpdated
```json
{ "type": "shopping/itemNoteUpdated", "payload": {
    "listId": "uuid",
    "itemId": "apples",
    "note": "nur Bio"
}}
```

### customVariantAdded
```json
{ "type": "shopping/customVariantAdded", "payload": {
    "listId": "uuid",
    "productId": "apples",
    "variantName": "Honeycrisp"
}}
```

---

## Kein Family Aggregate

> **Entschieden (2026-07-25): Es gibt kein Familien-Konzept.** Die Einheit von Zugriff und Kollaboration ist die Liste (Owner-Modell, siehe oben). Das frühere Family-Aggregate entfällt vollständig: `familyCreated`, `memberInvited`, `memberJoined`, `memberRemoved` sind durch die Listen-Commands (`/lists/{id}/invites`, `/lists/join`, `/lists/{id}/members/{memberId}`) ersetzt. `preferencesUpdated` (Ernährungspräferenzen) hat damit kein Aggregate mehr — offen, siehe [status.md](../architecture/status.md) §7.

Nachrichten und Reaktionen leben auf dem **ShoppingList-Aggregate** (Feed pro Liste):

### messageSent
```json
{ "type": "lists/messageSent", "payload": {
    "listId": "uuid",
    "messageId": "uuid",
    "text": "Vergiss die Milch nicht!",
    "sentBy": "user-id"
}}
```

### reactionAdded
```json
{ "type": "lists/reactionAdded", "payload": {
    "listId": "uuid",
    "targetEventId": "event-uuid",
    "emoji": "👍",
    "reactedBy": "user-id"
}}
```

---

## Recipe Aggregate

Aggregate-ID: `RECIPE#{recipeId}`

`recipeUpdated` und `recipeDeleted` sind **Klasse 1**. `recipeCreated` ist —
wie `listCreated` — ein **eröffnendes Klasse-1-Event**: Es steht in der
Allowlist (Envelope und Schema prüfen es) und geht an den eigenen Endpunkt
`POST /recipes`, weil noch kein Log existiert.
Der Server claimt die Ownership atomar und schreibt das Event selbst.

`recipeMemberAdded` und `recipeMemberRemoved` sind **Klasse 2**: Sie werden
ausschließlich vom Server geschrieben (Join, Add-Member, Remove-Member) und
am generischen Append-Pfad abgelehnt — exakt wie ihre Listen-Pendants.

Der geplante **Rezept-Import per URL** ist dagegen **Klasse 2**: Der Server holt eine vom Nutzer gelieferte URL: das ist ausgehender Traffic aus dem Lambda auf ein beliebiges Ziel (SSRF-Fläche) und gehört serverseitig eingehegt — Allowlist bzw. Blocken interner Adressbereiche, Timeout, Größenlimit. Ergebnis ist ein serverseitig geschriebenes `recipeCreated`.

### recipeCreated
```json
{ "type": "recipes/recipeCreated", "payload": {
    "recipeId": "uuid",
    "name": "Spaghetti Bolognese",
    "createdBy": "user-uuid",
    "portions": 4,
    "durationMinutes": 30,
    "ingredients": [
        { "name": "Spaghetti", "quantity": "500", "unit": "g" },
        { "name": "Hackfleisch", "quantity": "400", "unit": "g" }
    ],
    "steps": ["Wasser aufsetzen", "Sauce köcheln"]
}}
```

### recipeUpdated
```json
{ "type": "recipes/recipeUpdated", "payload": {
    "recipeId": "uuid",
    "name": "Spaghetti Bolognese",
    "portions": 6,
    "durationMinutes": 30,
    "ingredients": [{ "name": "Spaghetti", "quantity": "750", "unit": "g" }],
    "steps": ["Wasser aufsetzen"]
}}
```

Das Formular speichert als **eine** Absicht, deshalb trägt `recipeUpdated`
alle editierbaren Felder. Die Mitgliedschaft ist davon ausgenommen — sie
reist in eigenen Events und wird nie überschrieben.

### recipeMemberAdded / recipeMemberRemoved
```json
{ "type": "recipes/recipeMemberAdded", "payload": {
    "recipeId": "uuid", "memberId": "user-uuid", "name": "Tom"
}}
{ "type": "recipes/recipeMemberRemoved", "payload": {
    "recipeId": "uuid", "memberId": "user-uuid"
}}
```

### recipeDeleted
```json
{ "type": "recipes/recipeDeleted", "payload": {
    "recipeId": "uuid"
}}
```

---

## WeekPlan Aggregate

Aggregate-ID: `PLAN#{userId}#{year}-W{week}`

> Nach Wegfall des Familien-Konzepts **user-scoped** (war: `PLAN#{familyId}#…`). Ob Wochenpläne geteilt werden können, ist offen — [status.md](../architecture/status.md) §7.

`recipeAssigned` und `recipeUnassigned` sind **Klasse 1**.

### recipeAssigned
```json
{ "type": "mealPlan/recipeAssigned", "payload": {
    "week": 15,
    "year": 2026,
    "dayOfWeek": 3,
    "recipeId": "recipe-uuid"
}}
```

### recipeUnassigned
```json
{ "type": "mealPlan/recipeUnassigned", "payload": {
    "week": 15,
    "year": 2026,
    "dayOfWeek": 3
}}
```

---

## Cross-Aggregate Event

### ingredientsCheckedOut
```json
{ "type": "mealPlan/ingredientsCheckedOut", "payload": {
    "listId": "uuid",
    "ingredients": [
        { "name": "Spaghetti", "quantity": "500", "unit": "g" },
        { "name": "Hackfleisch", "quantity": "400", "unit": "g" }
    ]
}}
```
Dispatched von MealPlan, verarbeitet vom Shopping-Reducer (erzeugt ListItems).

**Aggregate-Zuordnung:** Das Event landet im Log des **ShoppingList-Aggregates** (`LIST#{listId}`) — es erzeugt Items dieser Liste und muss von allen Listen-Mitgliedern gefaltet werden, unabhängig davon, ob sie den Wochenplan nutzen. Klasse 1. Für die Sync-Engine (`synced`-Entscheidung, Envelope-Check `aggregateId` = Pfad) ist das **Ziel-Aggregate** maßgeblich, nicht das Feature, das dispatcht.

---

## DynamoDB Schema

### Events Table — die Wahrheit

```
PK: aggregateId     (LIST#abc, RECIPE#123, PLAN#user1#2026-W15)
SK: EVT#<position>  (zero-padded Sequenznummer, vom Server beim Append vergeben)
Attributes: type, payload (opak), userId, eventId, deviceId
```

Kein `familyId`, kein Family-GSI. **Der Cursor ist pro Aggregate** — Positionen sind Sequenznummern je Log, es gibt keinen globalen Cursor über alle Listen. Ein Client hält je Liste eine letzte Position und holt pro Liste nach; welche Listen er hat, sagt ihm `GET /lists` (Membership-Projektion). Der Activity Feed ist eine Projektion **pro Liste** über deren Log.

Die **Position ist die kanonische Reihenfolge** — eine pro Aggregate strikt aufsteigende, lückenlose Sequenznummer, zero-padded, damit String-Vergleich = numerischer Vergleich. Sie ist die Grundlage der Konfliktauflösung ([conflict-resolution.md](../architecture/conflict-resolution.md) §3). Keine Uhr geht in den Sortierschlüssel ein; die Server-Empfangszeit liegt als Attribut `appendedAt` im Event-Item.

**Monotonie per Konstruktion:** Der Append liest die letzte Position und schreibt konditional auf die nächste (`attribute_not_exists` auf dem Event-Item); verlorenes Rennen → Retry auf der übernächsten. Kein Event kann vor bereits ausgelieferte Positionen rutschen — `GET /lists/{id}/events?since=<cursor>` verliert nie ein Event. Siehe [sync-engine.md](../architecture/sync-engine.md) §6.

**Dedup:** Zusätzlicher Item pro `eventId`, geschrieben per Conditional Put (`attribute_not_exists`). Ein doppelt zugestelltes Event gelangt nie ins Log.

> ⚠️ `services/event-handler/src/handler.rs` verwendet derzeit `pk0 = USER#{user}`. Das ist falsch: Bei einer *geteilten* Liste liegen die Events dann über die Partitionen der Mitglieder verstreut und sind nicht zusammenhängend lesbar — bricht sowohl Sync als auch Activity Feed.

### Snapshot Table — Cache, nicht Wahrheit

```
PK: aggregateId
Attributes: snapshot (opakes JSON), upToPosition
```

Erzeugt vom **Client**, nicht von einem Stream Processor: Der Client faltet ohnehin und lädt `fold(log)` periodisch hoch. Damit existiert die Fachlogik genau einmal, in TypeScript — kein Rust-Fold, keine Doppel-Implementierung der Reducer.

Der Snapshot ist reiner Performance-Cache für den Bootstrap neuer Geräte und **nie autoritativ**; jeder Client muss ihn gegen den Log nachrechnen können. Details und Sicherheits-Constraint: [sync-engine.md](../architecture/sync-engine.md) §7.

---

## API Endpoints

### Klasse 1 — generischer Event-Append

```
POST  /lists/{id}/events        Envelope validieren, Position vergeben, appenden, broadcasten
GET   /lists/{id}/events        Events seit ?since=<position>
GET   /lists/{id}/snapshot      Snapshot + upToPosition für den Bootstrap
PUT   /lists/{id}/snapshot      Snapshot hochladen
GET   /lists                    Aggregate-IDs des Aufrufers (Membership-Projektion) — Bootstrap + Reconnect-Fanout
```

`/recipes/{id}/events` ist gebaut und liegt auf **denselben** Lambdas; sie
lesen Kind und Id aus dem Pfad. `/plans/{id}/events` folgt mit dem Wochenplan.
**Ein Lambda bedient alle Event-Typen** — es deserialisiert das Payload nicht.

**Beitritt für alle Aggregate:** `POST /lists/join` bleibt die einzige
Join-Route. Welches Aggregat beigetreten wird, steht im Token, nicht im Pfad;
die Antwort sagt es dem Client: `{ "aggregate": { "kind": "recipe", "id": "…" }, "alreadyMember": false }`.

### Klasse 2 — Commands mit Fachlogik

```
POST    /lists                              → prüft createdBy = Aufrufer, claimt Ownership, schreibt listCreated
POST    /lists/{id}/invites                 → Owner-only: erzeugt Invite-Token (Link/QR), widerrufbar
POST    /lists/join                         → Token prüfen, schreibt listMemberAdded
DELETE  /lists/{id}/members/{memberId}      → Owner (jeden) oder Mitglied (sich selbst), schreibt listMemberRemoved
POST    /recipes                            → prüft createdBy = Aufrufer, claimt Ownership, schreibt recipeCreated
GET     /recipes                            → Rezept-IDs des Aufrufers (+ ownerNames, maxMembers)
POST    /recipes/{id}/invites               → Owner-only: Invite-Token für ein Rezept
POST    /recipes/{id}/members               → Owner fügt jemanden aus dem Adressbuch hinzu
DELETE  /recipes/{id}/members/{memberId}    → Owner (jeden) oder Mitglied (sich selbst)
POST    /recipes/import                     → URL holen, parsen, schreibt recipeCreated (noch nicht gebaut)
```

**Invite-Links auf Mobile:** Der Invite-Link muss als **Android App Link** (`assetlinks.json`) bzw. **iOS Universal Link** (AASA) registriert sein, damit „Link öffnen" in die App führt (Capacitor App-Plugin, `appUrlOpen`). Fallback für Nutzer ohne App: Web-Landing-Page mit Store-Verweis. App Links sind noch **nicht** eingerichtet — der Link funktioniert derzeit nur im Browser/WebView derselben Origin.

**Token (entschieden 2026-07-31):** UUID v4 in Simple-Form (32 Hex-Zeichen), **7 Tage** gültig, **ein aktiver Token pro Liste**. Ein erneutes `POST /lists/{id}/invites` gibt den bestehenden Token zurück, solange er gültig ist — damit bleiben Link und QR über Screen-Besuche hinweg stabil. Beide Lookups (nach Liste, nach Token) liegen in der Membership-Tabelle, bewusst ohne `userId`-Attribut, damit sie nicht im `byUser`-GSI auftauchen. Ein ersetzter Token lässt seine Token-Zeile als Leiche zurück; sie läuft über die Ablaufprüfung im Use Case aus. **Widerruf: weiterhin offen.**

**Namen in `listMemberAdded`:** Der Server liest den Anzeigenamen per `cognito-idp:ListUsers` (Filter auf `sub`) aus dem User Pool — der Access Token trägt nur `sub`, keinen `name`-Claim. Der **Owner** löst für sich selbst nie ein `listMemberAdded` aus; sein Name reist deshalb additiv in `GET /lists` (`ownerNames`), nicht im Event-Log.

Je ein eigenes Lambda. Diese Liste wächst **nicht** mit der Feature-Zahl — sie umfasst Identität, Zugriff und externe Effekte, nicht die Domäne.

### Querschnittlich

- **Rate Limiting pro User** (API-Gateway-Usage-Plan) und **Payload-Cap**. Ein append-only Log, in den Clients schreiben, ist sonst ein unbegrenzter Storage- und Fold-Angriff.
- **Idempotenz** über `meta.eventId` — der Client darf beim Retry gefahrlos erneut senden.
- **Attribution:** Der Server speichert die `userId` aus dem JWT als Event-Attribut. Für Anzeige und Activity Feed ist diese server-verifizierte `userId` maßgeblich. Actor-Felder im Payload (`addedBy`, `checkedBy`, `sentBy`, …) sind Client-Angaben — Klasse 1 validiert Payloads nicht, sie sind also fälschbar. Clients dürfen sie bei fremden Events nicht als Wahrheit übernehmen.
