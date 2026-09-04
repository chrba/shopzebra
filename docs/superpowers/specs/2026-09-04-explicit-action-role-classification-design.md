# Explizite Action-Rollen-Klassifikation für die Sync-Engine

**Datum:** 2026-09-04 (überarbeitet nach Code-Audit)
**Bezug:** `cleanup-model.todo` (Repo-Root), Punkte 1, 3, 5 (Punkt 2 wird hier nur benannt, nicht strukturell umgesetzt — siehe "Nicht-Ziele")

## Problem

`apps/mobile/src/app/sync/aggregate.ts` (`aggregateOf()`) und
`apps/mobile/src/app/sync/needsSync.ts` (`needsSync()`) entscheiden heute,
ob eine dispatchte Redux-Action synchronisiert werden muss, indem sie im
Payload nach einem Feld wie `listId`/`recipeId` suchen:

```ts
for (const kind of ALL_KINDS) {
  const id = fields[ID_FIELD_OF[kind]]
  if (typeof id === 'string') return { kind, id }
}
```

Das führt zu einem konkreten, im Code sichtbaren Hack:
`apps/mobile/src/features/lists/domain/leaveList.ts:38` dispatcht bewusst
`listLeft({ id: listId })` — mit `id` statt `listId`, nur damit
`aggregateOf()` die Action **nicht** erkennt. Dieselbe Heuristik entscheidet
implizit auch, dass `ownerNamesLoaded`/`memberLimitLoaded`/
`recipeOwnerNamesLoaded` (Ergebnisse von `GET`-Abfragen, dispatcht in
`app/router.ts`) nicht synchronisiert werden — ohne dass diese Kategorie
irgendwo benannt wäre.

Die Sync-Zugehörigkeit einer Action ist damit nicht explizit im Modell
sichtbar, sondern hängt an impliziten Payload-Konventionen.

## Ziel

Jede Action eines `synced: true`-Slice bekommt eine **explizite, typsicher
erzwungene Rolle**, aus der ihr Sync-Verhalten über eine exhaustive Tabelle
folgt — statt es aus der Form des Payloads zu erraten.

## Nicht-Ziele

- **Vollständige Command/Event-Trennung (TODO Punkt 2)** wird hier nicht
  strukturell umgesetzt. `listCreated`/`recipeCreated` bleiben über den
  bestehenden `.match()`-Sonderfall in `app/sync/send/toOutboxEntry.ts`
  geroutet. Diese Umsetzung fügt nur die ehrliche Beschriftung
  (`role: 'command'`) hinzu, weil der verpflichtende Rollen-Typ sonst zu
  einer falschen Zuordnung (`role: 'event'`) zwingen würde. Die echte
  Trennung (Dispatch über einen dedizierten Thunk, außerhalb der
  generischen Pipeline) ist Plan 2 und in `cleanup-model.todo` vermerkt.
  **Solange Plan 2 aussteht, verspricht das Label mehr, als der Code hält** —
  der Doc-Kommentar am Typ sagt das ausdrücklich.
- Kein `meta.origin`-Konzept (TODO Punkt 4).
- Kein Umbau der Kopplung Redux-Action/Domain-Event/Wire-Format (TODO
  Punkt 6) — bewusste, in `domain-model.md` §8 begründete Entscheidung.

## Rollen-Vokabular

```ts
export type ActionRole =
  | 'event'
  | 'command'
  | 'localEvent'
  | 'observation'
  | 'hydration'
```

| Rolle | Bedeutung | Beispiele |
|---|---|---|
| `event` | Echte fachliche Tatsache, durch eine Nutzerhandlung ausgelöst, Teil der Aggregate-Historie | `listRenamed`, `itemChecked`, `listMemberAdded` |
| `command` | Sieht wie ein Event aus, ist aber serverautoritativ (Klasse 2) — der Server claimt Ownership und schreibt das Event selbst | `listCreated`, `recipeCreated` |
| `localEvent` | Echte fachliche Tatsache, deren Verbreitung bewusst auf dieses Gerät beschränkt ist: die autoritative Fassung hat den Server bereits über einen Command erreicht | `listLeft`, `listRestored`, `recipeLeft` |
| `observation` | Ein aktueller Zustand, den eine Abfrage gemeldet hat — keine Nutzerhandlung, kein Log-Eintrag | `ownerNamesLoaded`, `memberLimitLoaded`, `recipeOwnerNamesLoaded` |
| `hydration` | Wiederherstellung von Daten, die dieses Gerät bereits kannte, aus dem lokalen Storage | `listsLoaded`, `recipesLoaded`, `shoppingLoaded` |

Drei dieser fünf Rollen (`localEvent`, `observation`, `hydration`) führen
heute zum selben Sync-Verhalten. Das ist beabsichtigt und kein Redundanz-
Defekt: `cleanup-model.todo` Punkt 3 verlangt die Kategorie ausdrücklich
(*"nicht als lokale Sonder-Events behandeln, sondern als eigene Kategorie …
ihre Herkunft aus Query/Projection soll sichtbar sein"*). Der Typ
beschreibt, wovon die Funktion nur einen Teil verzweigt — das ist die
normale Rollenteilung aus `CLAUDE.md` ("Types beschreiben, Funktionen
transformieren"). Damit die Gleichbehandlung sichtbar statt erschlossen
ist, steht sie in einer exhaustiven Tabelle (siehe unten).

## Deklarationsmechanismus

`role` ist ein **Pflichtfeld** an jedem Case-Reducer eines
`synced: true`-Slice, erzwungen durch einen zweiten `createSlice`-Overload
in `app/createSlice.ts`. Für nicht-synced Slices ändert sich nichts.

```ts
const listsSlice = createSlice({
  name: 'lists',
  synced: true,
  initialState,
  reducers: {
    listRenamed: { role: 'event', reducer: (state, action) => ... },
    listCreated: { role: 'command', reducer: (state, action) => ... },
    listLeft: { role: 'localEvent', reducer: (state, action) => ... },
    ownerNamesLoaded: { role: 'observation', reducer: (state, action) => ... },
    listsLoaded: { role: 'hydration', reducer: (state, action) => ... },
  },
})
```

Kein Default, kein optionales Feld: ein synced Slice, dessen Reducer keine
Rolle trägt, kompiliert nicht. Deshalb braucht es weder Laufzeit-Guard noch
Dev-Warnung.

**Typ-Umbau bewusst minimal gehalten.** Die bestehenden Inferenz-Typen
(`InferPayload`, `RawActionCreator`) bleiben unverändert — sie tragen die
Payload-Typen *aller* acht Slices, nicht nur der drei synced. Vorgeschaltet
wird lediglich ein Unwrap:

```ts
type WithoutRole<R> = R extends {
  readonly role: ActionRole
  readonly prepare: infer P
  readonly reducer: infer F
}
  ? { readonly prepare: P; readonly reducer: F }
  : R extends { readonly role: ActionRole; readonly reducer: infer F }
    ? F
    : R
```

Die Rollen-Form wird damit auf eine Form abgebildet, die die vorhandene
Inferenz schon kennt. Kein Umschreiben der subtilen Conditional Types, kein
Risiko einer stillen Inferenz-Verschlechterung in nicht betroffenen Slices.

## Registry statt Middleware

`createSlice` trägt jede deklarierte Rolle in eine Registry
`actionType → role` ein und exportiert `roleOf(type)`. **Es gibt keine
Middleware und kein `meta.role`-Feld.**

Begründung (Ergebnis eines Code-Audits): `meta` wird von `sendEntry.ts`
unverändert an den Server geschickt (`JSON.stringify({ type, payload, meta })`).
Ein `meta.role` würde also bei jedem Event mitreisen, obwohl es eine rein
clientinterne Klassifikation ist. Der Server nähme keinen Schaden — geprüft:
`services/domain/src/envelope.rs` validiert nur den `payload` gegen die
Schemas, `services/lib/src/wire.rs` liest einzelne Felder, nirgends
`deny_unknown_fields`, und `StoredEvent::to_wire` gibt das Feld nie zurück.
Es wäre also stillschweigend verworfen: übertragen, ignoriert, weggeworfen.

Da die Rolle allein am Action-Type hängt und der Registry jederzeit
vorliegt, ist das Stempeln überflüssig. `needsSync()` schlägt direkt nach.
Das spart die Middleware, den Eingriff in die Store-Pipeline, das
zusätzliche Wire-Feld — und lässt alle bestehenden Fixtures in
`toOutboxEntry.test.ts` unverändert grün, weil die Registry durch den
Slice-Import gefüllt ist.

## Sync-Politik als exhaustive Tabelle

```ts
/** Which roles travel to the server. Exhaustive by type: a new role forces a decision here. */
const REACHES_SERVER: Readonly<Record<ActionRole, boolean>> = {
  event: true,
  command: true,
  localEvent: false,
  observation: false,
  hydration: false,
}

export function needsSync(action: PayloadAction<unknown>): boolean {
  if (!action.meta || action.meta.remote) return false
  const role = roleOf(action.type)
  return role !== undefined && REACHES_SERVER[role]
}
```

Tabelle statt Bedingung, aus drei Gründen: die Gleichbehandlung der drei
lokalen Rollen wird sichtbar und gewollt statt erschlossen; eine sechste
Rolle ohne Eintrag ist ein Compile-Fehler; und Politik als Daten statt als
Logik ist im Code bereits Idiom (`ID_FIELD_OF`, `COLLECTION_OF` in
`aggregate.ts` sind dieselbe Konstruktion).

`aggregateOf()` bleibt bestehen, wird aber nur noch von `toOutboxEntry.ts`
für das Routing eines bereits als serverbestimmt klassifizierten Events
benutzt — keine Klassifikationsheuristik mehr.

## Nebeneffekt: der Payload-Hack verschwindet

`listLeft`/`recipeLeft` tragen danach ehrlich `{ listId }`/`{ recipeId }`.
Die Sync-Ausnahme hängt an der Rolle, nicht mehr am Feldnamen — genau der
in `cleanup-model.todo` Punkt 1 benannte Defekt.

**Bewusst in Kauf genommen:** der alte Feldname war eine zufällige zweite
Verteidigungslinie (ein fälschlich als `event` markiertes `listLeft` würde
nach dem Rename an `/lists/{id}/events` gepostet). Der Schutz war nie
entworfen, sondern Nebenwirkung; die Rolle ist dafür typgeprüft.

## Migrationsumfang

Betroffen sind **alle drei** `synced: true`-Slices:

**`features/lists/domain/listsSlice.ts`:** `listsLoaded` → `hydration`,
`listCreated` → `command`, `listRenamed` → `event`, `listLeft` →
`localEvent` (Payload `id` → `listId`), `listRestored` → `localEvent`,
`listDeleted` → `event`, `listMemberAdded` → `event`, `listMemberRemoved`
→ `event`, `memberLimitLoaded` → `observation`, `ownerNamesLoaded` →
`observation`.

**`features/shopping/domain/shoppingSlice.ts`:** `shoppingLoaded` →
`hydration`; `itemAdded`, `itemChecked`, `itemUnchecked`, `itemRemoved`,
`itemUpdated`, `itemNoteUpdated`, `customVariantAdded` → `event`.

**`features/recipes/domain/recipesSlice.ts`:** `recipesLoaded` →
`hydration`, `recipeCreated` → `command`, `recipeUpdated` → `event`,
`recipeLeft` → `localEvent` (Payload `id` → `recipeId`), `recipeDeleted` →
`event`, `recipeMemberAdded` → `event`, `recipeMemberRemoved` → `event`,
`recipeOwnerNamesLoaded` → `observation`.

**Konsumenten des `listLeft`-Payloads** (ziehen mit dem Rename mit):
`features/lists/domain/leaveList.ts`, `app/sync/startSync.ts` (`dropped()`,
auch `recipeLeft`), `features/preferences/domain/preferencesSlice.ts`
(extraReducer), `features/shopping/domain/shoppingSlice.ts` (extraReducer).

**Unangetastet:** `memberAddedLocally`/`memberRemovedLocally`
(`features/sharing/memberCommands.ts`) — nutzen bereits `meta.remote` zur
Selbstausnahme. Die `extraReducers` fremder Action-Typen brauchen keine
Rolle: sie gehören dem dispatchenden Slice.

## Doku nachziehen

`architecture/sync-engine.md` §3 sagt heute *"ein Boolean pro Slice, keine
per-Action-ifs"*. Genau das wird hier bewusst abgelöst, weil Slices
Kategorien mischen (ein Slice enthält Events, lokale Fakten und
Abfrageergebnisse nebeneinander). Der Abschnitt muss mit angepasst werden,
sonst widersprechen Doku und Code — `status.md` warnt selbst, dass eine
falsche Doku schädlicher ist als keine. Ebenso die Policy-Zeile in
`app/sync/README.md`.

## Testing

Ein eigener `needsSync.test.ts` deckt alle fünf Rollen, das Fehlen einer
Rolle, `meta.remote` und fehlendes `meta` ab. Die Rollenzuordnung selbst
ist compilergeprüft und braucht keinen Test pro Action.

## Diskutierte, verworfene Alternativen

- **Middleware mit `meta.role`** — verworfen: überflüssig, da die Rolle am
  Action-Type hängt; schickt zusätzlich ein clientinternes Feld über den
  Draht (siehe oben).
- **Stiller Default `event` bei fehlender Rolle** — verworfen: verschiebt
  die Implizitheit, statt sie zu beseitigen.
- **Eine Sammelrolle `local` für alles Nicht-Syncende** — verworfen:
  versteckt fachlich verschiedene Dinge (eigene lokale Intention vs.
  Bootstrap-Technik vs. Abfrageergebnis) unter einem vagen Namen und
  verfehlt TODO Punkt 3.
- **Reduktion auf `synced: boolean` pro Reducer** — verworfen: das ist die
  heutige Slice-Regel, nur feiner; beantwortet Punkt 1 und 3 nicht.
- Namenskandidaten `stateReported`, `snapshot`, `queryResponse`,
  `readModel`, `externalFact`, `currentFact`, `report`, `readout`,
  `advisory`, `localEffect` — verworfen wegen Grammatik, Kollision
  (`snapshot` ist in `status.md` §9 für ein Backend-Feature reserviert;
  `localEffect` kollidiert mit der `useEffect`-Ablehnung in `CLAUDE.md`)
  oder mangelnder Präzision.

## Offene Folge-Punkte

- **Plan 2: echte Command-Trennung.** `listCreated`/`recipeCreated` über
  einen dedizierten Thunk dispatchen, außerhalb der generischen Pipeline.
  Verifiziert: das ändert das Optimistic-UI-Verhalten **nicht** (der Client
  erzeugt die `listId` weiterhin selbst und wendet sofort lokal an) — nur
  der Dispatch-Pfad ändert sich. Sollte zeitnah folgen, sonst bleibt
  `role: 'command'` ein uneingelöstes Versprechen.
