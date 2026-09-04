# Sync-Deklaration: eine Deklaration pro Action beantwortet „ob" und „wohin"

**Datum:** 2026-09-04
**Bezug:** Review der umgesetzten Rollen-Klassifikation
(`2026-09-04-explicit-action-role-classification-design.md`) und
`cleanup-model.todo` Punkte 1, 2, 3, 5. Ersetzt den dort vermerkten „Plan 2".

## Problem

Die Rollen-Klassifikation hat die Frage „verlässt diese Action das Gerät?"
an den Reducer gebracht. Vier Gerüche blieben:

1. **`role: 'command'` lügt.** `listCreated` heißt wie eine Tatsache, ist
   deklariert wie ein Antrag, und verhält sich im Client exakt wie ein
   Event: der Client erzeugt die `listId`, wendet sofort an, legt es in
   `pending` und die Outbox; der Server appended es wörtlich mit der
   Client-`event_id` (`services/domain/src/usecases/create_list.rs`) und
   bootstrappt nur die Membership-Projektion. Ein Gast arbeitet monatelang
   ohne Server damit. Der einzige Unterschied ist der **Endpunkt**
   (`POST /lists` statt `POST /lists/{id}/events`) — ein Routing-Detail,
   heute als `.match()`-Sonderfall in `toOutboxEntry.ts`.
2. **Klassifikation und Routing sind entkoppelt, der Riss nur geloggt.**
   `aggregateOf()` rät das Aggregate weiterhin aus dem Payload. Ein
   `event` ohne Aggregate-Feld kompiliert, landet in `pending` (withSync
   fragt nur die Rolle) und bleibt dort für immer — mit einer
   `console.error`.
3. **Zwei Mechanismen für „nicht syncen".** `memberAddedLocally` dispatcht
   `listMemberAdded` mit gefälschtem `meta.remote`, damit es die Outbox
   nicht erreicht. Dieselbe Geruchsklasse wie der alte `id`-Hack: ein
   Herkunfts-Flag als Politik-Schalter.
4. **`listLeft` vermischt drei Ursachen** (ich verlasse; der Owner entfernt
   mich; gelöscht während ich offline war — die letzten beiden über
   `startSync.dropped()`). Der Name sagt „ich bin gegangen".

Dazu: die Rollen-Registry ist eine globale `Map`, gefüllt per
Import-Nebeneffekt; Tests verlassen sich darauf, dass ein Slice importiert
wurde.

## Entscheidungen (mit dem Nutzer, 2026-09-04)

- **`listCreated`/`recipeCreated` sind Tatsachen, keine Anträge.** Echte
  Commands (Invite, Join, Member entfernen) leben bereits als Thunks in
  `memberCommands.ts` und erzeugen nie eine Slice-Action — das ist das
  Command-Modell des Clients, und es bleibt.
- **Eine lokale Tatsache „dieses Gerät hält es nicht mehr"** ersetzt
  `listLeft`. Der Grund ist nicht ermittelbar (`GET /lists` sagt nur, was
  fehlt) und gehört, falls je nötig, in den Activity Feed.
- **Der Freundes-Tap bleibt optimistisch**, bekommt aber eine ehrliche
  lokale Tatsache statt der `remote`-Lüge.
- **Nicht im Scope:** `meta.origin` (TODO Punkt 4 — mit dem Ende der Lüge
  bedeutet `remote` wieder genau eins) und die Kopplung Action = Event =
  Wire (Punkt 6, bewusste Grundentscheidung).
- Bestehende Tests dürfen angepasst werden — nur die im Plan namentlich
  genannten.

## Design

### Deklarations-Vokabular

```ts
export type ActionRole = 'event' | 'localEvent' | 'observation' | 'hydration'

export type ActionDeclaration =
  | { readonly role: 'event'; readonly on: AggregateKind }     // Tatsache auf einem bestehenden Log
  | { readonly role: 'event'; readonly opens: AggregateKind }  // Tatsache, die ein neues Log eröffnet
  | { readonly role: 'localEvent' }                            // Tatsache nur für dieses Gerät
  | { readonly role: 'observation' }                           // Ergebnis einer Abfrage
  | { readonly role: 'hydration' }                             // Wiederherstellung aus dem Storage
```

```ts
listCreated:  { role: 'event', opens: 'list', reducer }   // → POST /lists (createdBy auf dem Wire)
listRenamed:  { role: 'event', on: 'list',    reducer }   // → POST /lists/{listId}/events
itemAdded:    { role: 'event', on: 'list',    reducer }   // shopping-Slice, Listen-Log — per Action, nicht per Slice
listDropped:  { role: 'localEvent',           reducer }
```

`command` entfällt. Was `listCreated` unterscheidet, steht in `opens` — es
eröffnet ein Log, für das noch keine Membership existiert, deshalb geht es
an die Collection, wo der Server Ownership bootstrappt. Der Server bleibt
unverändert.

**Die Sync-Frage („ob") beantwortet allein die Rolle**, als exhaustive
Tabelle wie bisher: `event` → ja; `localEvent`, `observation`, `hydration`
→ nein. Dazu die technischen Vorbedingungen: `meta` vorhanden, nicht
`remote`. Actions außerhalb eines `synced: true`-Slice haben keine
Deklaration und werden nie gesynct.

### Compile-Zeit-Erzwingung des Payloads

Ein Reducer mit `on: 'list'` oder `opens: 'list'` muss eine
`PayloadAction<{ readonly listId: string; … }>` annehmen; analog `recipeId`
für `recipe`, `planId` für `plan`. `createSlice` prüft das über eine
rekursive Constraint auf dem `reducers`-Objekt. Ein `role: 'event'` ohne
`on`/`opens` kompiliert nicht. Damit ist der heutige Laufzeitfall
„admitted, aber nicht routbar" strukturell ausgeschlossen —
`aggregateOf()` und die `console.error` entfallen.

### Explizit komponierte Policy statt globaler Registry

`createSlice` gibt zusätzlich `declarations: Readonly<Record<actionType, ActionDeclaration>>`
zurück (leer für nicht-synced Slices). Jeder synced Slice exportiert sie
(`listsSyncDeclarations`, …). `app/sync/appSyncPolicy.ts` komponiert daraus
**explizit** die eine `SyncPolicy`:

```ts
export type SyncPolicy = {
  readonly reachesServer: (action) => boolean            // withSync: gehört in pending?
  readonly toOutboxEntry: (action) => OutboxEntry | null // Send-Pfad: wohin?
  readonly domainPayloadOf: (type, payload) => payload   // Receive-Pfad: createdBy → ownerId
  readonly domainActionOf: (wire) => action              // Neustart: Queue → pendingRestored
}
```

`store.ts` reicht `appSyncPolicy.reachesServer` an `withSync`; die
`SyncEngine` bekommt die Policy im Konstruktor. Keine globale `Map`, kein
`roleOf()`, kein `belongsToSyncedSlice()`, keine Import-Reihenfolge, auf die
irgendwer angewiesen ist. Tests bauen ihre Policy aus Demo-Slices.

Die `ownerId ↔ createdBy`-Übersetzung hängt an `opens`: eröffnende Events
tragen per `services/events.md` den Ersteller. `wire.ts` behält nur die zwei
puren Umbenennungsfunktionen; die Liste `CREATION_EVENTS` entfällt.

### Lokale Tatsachen, ehrlich benannt

- `listLeft` → **`listDropped { listId }`**, `recipeLeft` →
  **`recipeDropped { recipeId }`** (`localEvent`): „dieses Gerät hält es
  nicht mehr" — für `leaveList` und für `startSync.dropped()`.
  `listRestored` bleibt (Rollback eines gescheiterten Verlassens).
- Freundes-Tap: **`listMemberAddedLocally { listId, memberId, name }`** und
  **`listMemberRemovedLocally { listId, memberId }`** (`localEvent`, gleicher
  Reducer-Kern wie die Server-Events, geteilt über pure Funktionen im
  Slice); Rezepte analog. `memberCommands.ts` dispatcht diese statt
  `fromServer(listMemberAdded(...))`. **`app/fromServer.ts` wird gelöscht** —
  danach setzt nur noch der Receive-Pfad `remote: true`.

### Was entfällt, was bleibt

Entfällt: Rolle `command`, `aggregateOf()`, `belongsToSyncedSlice()`,
`roleOf()`, die globale Registry, `needsSync.ts`, `toOutboxEntry.ts` (beide
in der Policy aufgegangen), die `.match()`-Sonderfälle, `CREATION_EVENTS`,
`fromServer.ts`, das Fake-`remote`-Muster, der „Plan 2".

Bleibt: Wire-Format, Server, `withSync`-Mechanik, Outbox, Catch-up,
`synced: true` am Slice als Compiler-Zwang, Optimistic-UI überall.

## Migrationsumfang

- `app/createSlice.ts`: Deklarationstypen, Constraint, `declarations`,
  Registry raus.
- `app/sync/syncPolicy.ts` (neu), `app/sync/appSyncPolicy.ts` (neu).
- `app/sync/aggregate.ts`: `aggregateOf` raus, `idFieldOf` exportieren.
- `app/sync/wire.ts`: nur noch die zwei Umbenennungen.
- `app/sync/syncEngine.ts`: Policy im Konstruktor; `record`, `openLocalLog`,
  `syncOnce` nutzen sie. `receive/catchUp.ts`/`toLocalAction.ts`: Übersetzung
  wird gereicht statt importiert.
- `app/store.ts`: `withSync(featureReducer, appSyncPolicy.reachesServer)`.
- `features/lists|shopping|recipes/domain/*Slice.ts`: `on`/`opens`, Renames,
  neue lokale Actions, `*SyncDeclarations`-Export.
- `features/lists/domain/leaveList.ts`, `app/sync/startSync.ts`,
  `features/preferences/domain/preferencesSlice.ts`, drei
  `*ClientStorageHandler.ts`, `features/sharing/memberCommands.ts`.
- Gelöscht: `app/sync/needsSync.ts`, `app/sync/send/toOutboxEntry.ts`,
  `app/fromServer.ts`.

## Tests

`test/app/sync/syncPolicy.test.ts` (neu) mit Demo-Slices: alle Rollen,
`on`/`opens`-Routing inkl. `createdBy`, `remote`, fehlendes `meta`,
undeklarierte Actions, doppelte Deklaration. `test/app/createSlice.types.ts`
(neu, nur `tsc`): `@ts-expect-error` für Event ohne `listId`, Event ohne
`on`/`opens`, synced Reducer ohne Rolle. Angepasst werden nur die im Plan
genannten Tests.

## Doku

`architecture/sync-engine.md` §3 und §6, `architecture/design-decisions.md`
(„Zwei Arten von Endpunkten"), `services/events.md` (Wortwahl „Hybrid" bei
`listCreated`/`recipeCreated`), `apps/mobile/src/app/sync/README.md`,
`architecture/status.md`, `cleanup-model.todo`, `sync-engine.txt`.

## Verworfene Alternativen

- **Nur `command` durch ein `endpoint`-Feld ersetzen** — behält Payload-Scan
  und Import-Nebeneffekt.
- **Zentrale Tabelle `syncPolicy.ts` (type → Deklaration) statt am Reducer**
  — weit weg vom Ort der Definition, keine Compile-Prüfung des Payloads.
- **Plan 2: `createList`-Thunk außerhalb der Outbox** — verliert Offline-Queue,
  Retry, 4xx-Rollback, Ack per `eventId` und bricht den Gast-Betrieb, dessen
  Listen ohne Identität in der Outbox liegen.
- **Zwei lokale Tatsachen `listLeft`/`listAccessLost`** — der Grund ist beim
  Catch-up nicht ermittelbar, die zweite Action hätte „unbekannt" getragen.
