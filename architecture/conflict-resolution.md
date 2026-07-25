# Conflict Resolution — ShopZebra

Wie ShopZebra Konflikte auflöst, wenn mehrere Familienmitglieder gleichzeitig dieselbe Liste bearbeiten. Für den Sync-Mechanismus selbst siehe [sync-engine.md](./sync-engine.md), für die Sync-Architektur [design-decisions.md](./design-decisions.md), für das Datenmodell [domain-model.md](./domain-model.md).

> **Entscheidung getroffen:** Konflikte werden über ein **server-geordnetes Log (ULID) mit Client-Rebase** aufgelöst (§3). Der zuvor gleichrangig geführte Alternativweg — CRDT-Semantik von Hand mit Feld-Versionen und HLC — ist **verworfen** (§4).

---

## 1. Warum wir überhaupt Conflict Resolution brauchen

Die eigentliche Ursache von Konflikten ist **Nebenläufigkeit**: Zwei Personen ändern gleichzeitig dasselbe, ohne die Änderung der anderen schon zu sehen. Das gibt es in jeder kollaborativen App — die Frage ist nur, *wo* aufgelöst wird.

Drei bewusste Design-Entscheidungen bestimmen den Rahmen:

1. **Optimistic local-first** — der Client wendet eine Änderung *sofort* an und synct erst danach. Damit handelt jeder auf einem veralteten Stand → die Geräte laufen kurzzeitig auseinander.
2. **Offline-first** — es gibt Momente ohne Server.
3. **Dummer Backend** — der Server ist Event Store + Broadcaster, hat keine Business-Logik.

**Gegenprobe:** Würde jede Aktion synchron über einen autoritativen Server laufen (UI zeigt die Änderung erst nach Server-Bestätigung), könnte der Server eine einzige Reihenfolge festlegen und zentral auflösen. Preis: kein Offline, keine sofortige UI, Netz für jede Aktion. Das widerspricht direkt den Kern-Prinzipien *Speed first* und *Offline-first*. Der Trade-off ist bewusst.

Diese Gegenprobe verwirft aber nur die *synchrone* zentrale Auflösung. Der gewählte Weg (§3) nutzt eine zentrale Reihenfolge und bleibt trotzdem optimistic und offline-fähig.

---

## 2. Der häufige Irrtum: „append-only → keine Konflikte"

> „Conflict Resolution ist trivial: Events werden append-only geschrieben. Reihenfolge per Timestamp + Device-ID. Keine Merge-Konflikte."

Dieser Satz ist **irreführend**. Er vermischt zwei Ebenen:

- **Speicher-Ebene:** Append-only entfernt Write-Write-Konflikte in DynamoDB — zwei Clients schreiben nie in dieselbe Zeile. ✅ Hier stimmt es.
- **Semantische Ebene:** Der State ist `fold(alle Events)`. Der Konflikt verschwindet nicht — er **wandert von der Datenbank in die Reduce-Funktion**. Dort ist er sehr real. ❌

### Warum naives Anwenden divergiert

Weil „erst Client, dann Server" gilt, würde jedes Gerät die Events in **Ankunftsreihenfolge** falten:

```
Start: Milch qty = 1
Papa (Gerät A): setzt qty = 2
Mama (Gerät B): setzt qty = 5

Papas Gerät:  qty=2 (eigenes), dann qty=5 (Mamas per WS)  → Endstand 5
Mamas Gerät:  qty=5 (eigenes), dann qty=2 (Papas per WS)  → Endstand 2
```

→ Zwei Geräte, zwei dauerhaft verschiedene Endzustände. „Event beim Empfang einfach anwenden" **divergiert**. Es braucht entweder eine ordnungsunabhängige Merge-Regel (§4, verworfen) oder eine gemeinsame Reihenfolge (§3, gewählt).

Zweite Einsicht: Ein reines Last-Writer-Wins ist keine „Konfliktfreiheit", sondern eine Auflösung durch **Wegwerfen** einer Seite (Lost Update). „Keine Merge-Konflikte" heißt in Wahrheit „Konflikte werden still verschluckt".

---

## 3. Gewählt: Server-geordnetes Log + Client-Rebase

Der Client bleibt optimistic und offline-fähig, aber die **autoritative Reihenfolge der Events legt der Server beim Append fest**, und jeder Client faltet das Log in genau dieser Reihenfolge.

Der entscheidende Punkt: **Diese Ordnung existiert bei uns bereits.** Der `event-handler` vergibt beim Persistieren eine ULID als Sort Key — lexikographisch sortierbar, zeitstempel-basiert, eine Total Order über alle Events.

### Prinzip

```
1. Eigenes Event   → sofort lokal anwenden (optimistic) + in Pending-Queue
2. POST an Server  → Server appended, ULID = autoritative Position im Log
3. Client-State    = fold(bestätigtes Server-Log) ⊕ replay(eigene Pending-Events)
4. Bestätigtes Event trifft ein (eigenes oder fremdes, per AppSync oder Sync)
                   → in den bestätigten State folden, Pending-Events oben drauf
                     replayen ("Rebase"); das eigene bestätigte Event verlässt
                     die Pending-Queue (Match per eventId)
```

Offline funktioniert unverändert: Events sammeln sich in der Pending-Queue, die UI rechnet sie optimistisch ein. Beim Reconnect: `GET /sync?since=<ulid>`, bestätigten State nachfolden, Pending-Events senden. Die Pending-Queue **ist** die ohnehin geplante Offline-Queue — kein zusätzliches Konzept.

Die konkrete Umsetzung (Higher-Order Reducer `withSync`, Outbox, Transport) steht in [sync-engine.md](./sync-engine.md).

### Konvergenz per Konstruktion

Das Divergenz-Beispiel aus §2 unter Rebase:

```
Start: Milch qty = 1
Papa setzt qty=2  → erreicht Server zuerst  → ULID₁
Mama setzt qty=5  → erreicht Server danach  → ULID₂

Kanonisches Log: [qty=2 (ULID₁), qty=5 (ULID₂)]

Papas Gerät: fold([…, qty=2, qty=5]) → 5
Mamas Gerät: fold([…, qty=2, qty=5]) → 5
```

Alle Geräte falten dasselbe Log in derselben Reihenfolge → sie **können** nicht divergieren. Kommutativität und Idempotenz der Reducer müssen weder hergestellt noch per Property-Tests bewiesen werden — ein gewöhnlicher, deterministischer Fold genügt.

### Das Uhren-Problem verschwindet

Es gibt nur noch eine relevante Uhr: die des Servers beim Append.

```
Papa setzt qty=2                          → erreicht Server zuerst  → ULID₁
Mama sieht Papas Änderung, setzt qty=5    → erreicht Server danach  → ULID₂
Vergleich: ULID₂ > ULID₁                  → Mama gewinnt ✅
```

Wer online auf ein Event *reagiert*, dessen eigenes Event erreicht den Server zwangsläufig später — Kausalität ist durch die Log-Reihenfolge gratis gewahrt. Keine HLC, kein Drift-Problem, keine Client-Uhren im Merge-Pfad.

### Voraussetzung: Intention-Events

Rebase setzt **granulare Intention-Events** voraus. Ein Full-State-Event wie `listUpdated { name, memberIds }` klobbert beim Replay zuverlässig, was zwischenzeitlich bestätigt wurde. Das gilt verschärft gegenüber jedem anderen Ansatz, weil der Pending-Stack mehrfach neu über den bestätigten State gespielt wird.

`services/events.md` spezifiziert bereits korrekt granular (`listRenamed`, `listMemberAdded`, `listMemberRemoved`); `listsSlice.ts` ist seit 2026-07-25 daran angeglichen.

---

## 4. Verworfen: CRDT-Semantik von Hand

Der Alternativweg wäre gewesen, die Reducer **ordnungsunabhängig** zu machen: Operationen so gestalten, dass sie kommutativ, assoziativ und idempotent sind. Dann ist die Reihenfolge egal und alle Geräte konvergieren, ohne dass es eine kanonische Ordnung braucht. Konkret wäre der State eine Map aus drei CRDT-Bausteinen gewesen:

| Baustein | Wofür | Merge-Regel |
|---|---|---|
| LWW-Register | Einzelwerte (checked, name, note) | höhere Version gewinnt |
| OR-Set | Mengen mit Add/Remove (Items, Members, Varianten) | add + remove mit Tombstone; Re-Add = neues Element |
| Counter | additive Werte (optional für Menge) | Summe der Deltas |

Jedes Feld hätte zusätzlich seine **Version** gespeichert — `(time, deviceId)`, wobei Wall-Clock wegen Uhren-Drift langfristig durch eine **Hybrid Logical Clock** hätte ersetzt werden müssen, um Kausalitätsverletzungen zu vermeiden (Mama sieht Papas Änderung und reagiert darauf, verliert aber, weil ihre Uhr nachgeht).

### Warum verworfen

**1. Es widerspricht unserem eigenen Kernprinzip.** `design-principals.md` fordert *State ist Derived Data* und *Values statt Objects*. `state = fold(events in kanonischer Ordnung)` ist die wörtliche Umsetzung davon. „State wird inkrementell gepatcht, wobei jedes Feld seine Versionsmetadaten mitschleppt und der Reducer beim Anwenden vergleicht" ist es nicht — das *complected* den Wert mit der Frage, wer ihn zuletzt gesetzt hat.

**2. Wir haben bereits eine zentrale Ordnungs-Autorität.** Hand-CRDTs sind die richtige Antwort für Systeme *ohne* zentrale Ordnung (P2P, Multi-Master). Wir haben DynamoDB-Append mit ULID. Dieser Weg hätte auf dem Client Maschinerie gebaut, um eine vorhandene Ordnung *nicht* nutzen zu müssen — das braucht eine Rechtfertigung, die wir nicht haben.

**3. Die Merge-Semantik hätte pro Event entschieden und gepflegt werden müssen.** Mit sechs weiteren Aggregates (shopping, recipes, meal-plan, family, activity) wächst diese Tabelle mit jedem Feature. Unter §3 ist Konvergenz gratis.

**4. Doppel-Implementierung.** Jede Stelle, die serverseitig State materialisiert, hätte *exakt dieselben* Versions-Vergleiche in Rust implementieren müssen — zwei Sprachen, eine subtile Semantik, für immer synchron zu halten.

### Was dadurch entfällt

- Versions-Wrapper `{ value, version }` pro Feld — und damit deren Präsenz in jedem Slice, Selektor, Test und Storage-Format. Das Domain-Model bleibt plain values.
- HLC und Wall-Clock-Versionen komplett.
- Die Merge-Typ-Entscheidung pro Event. Neue Event-Typen konvergieren gratis.
- Kommutativitäts- und Idempotenz-Pflicht der Reducer samt Property-Tests als Beweis.
- OR-Set-Tombstones und die offene GC-Frage.
- Die Entscheidung „Menge als LWW oder als Counter?".

Auch das Dedup vereinfacht sich: Der Server lehnt doppelte `eventId`s beim Append per Conditional Put ab — Duplikate gelangen nie ins kanonische Log.

### Der eine echte Vorteil, den wir aufgeben

Der CRDT-Weg wäre **transport-unabhängig** gewesen: Weil kommutativ, hätte die Zustellreihenfolge keine Rolle gespielt. Unter §3 muss der Client eingehende Events **nach ULID sortieren**, und ein verspätetes Event mit älterer ULID erzwingt ein Re-Fold ab dem letzten bestätigten Stand. AppSync Events garantiert keine strikte Zustellreihenfolge, das ist also real. Der Preis ist bekannt und lokal begrenzt — er lebt in der Sync-Schicht, nicht in jedem Reducer. Voraussetzung dafür, dass der Cursor-Mechanismus dabei nichts verliert: Die ULID-Vergabe ist pro Aggregate streng monoton ([sync-engine.md](./sync-engine.md) §6) — sonst könnte ein verspätet geschriebenes Event dauerhaft hinter dem Cursor aller Clients verschwinden.

---

## 5. Wo die Auflösung lebt

**Im Reducer** — weil State = `fold(events)` und „mergen" die Falt-Entscheidung *ist*. Es gibt keinen separaten Conflict-Resolver.

Genauer: im **Higher-Order Reducer** `withSync` ([sync-engine.md](./sync-engine.md) §3), nicht in den Feature-Reducern. Die bleiben plain, deterministisch und wissen nichts von Sync.

### Was NICHT in den Reducer gehört

- **Nichtdeterminismus jeder Art** — `Date.now()`, `crypto.randomUUID()`, `Math.random()`. Beim Rebase wird mehrfach gefaltet; jedes Replay muss dasselbe ergeben. IDs und Timestamps entstehen in der Middleware und reisen im Event mit.
- **eventId-Dedup** (dasselbe Event kommt doppelt bei At-least-once-Zustellung) → in der Sync-Schicht, vor dem Fold.
- **Autorisierung** → Backend, siehe §6.

> ⚠️ Bestehendes Risiko: `eventIdMiddleware` vergibt bei *jedem* Dispatch eine neue `eventId`. Ein `fromServer(...)`-Event läuft ebenfalls durch die Middleware und darf dabei **keine neue eventId** bekommen — sonst bricht das Dedup und die Pending-Queue findet ihr eigenes bestätigtes Event nicht wieder.

---

## 6. Was Conflict Resolution *nicht* löst: Autorisierung

Konvergenz und Zugriffsschutz sind zwei verschiedene Achsen. Ein Log kann perfekt konvergieren und trotzdem Einträge enthalten, die nie hätten geschrieben werden dürfen.

Konkret besteht heute eine Lücke: `listMemberAdded { listId, memberId }` wird vom Client emittiert und append-only gespeichert. Membership wird aus dem Log abgeleitet, den Clients schreiben — **die Autorisierungsgrundlage stammt aus genau dem Stream, den die Autorisierung schützen soll.** Ein Client kann sich per `listMemberAdded { listId: <fremde Liste>, memberId: <ich> }` selbst Zugriff verschaffen.

Auflösung: Alle Zugriffsänderungen laufen über **Klasse-2-Commands** — der Server besitzt die Membership-Projektion, validiert und schreibt das Event selbst. Siehe [sync-engine.md](./sync-engine.md) §6.

---

## 7. Nicht-Konflikte (by design)

`color`, `emoji`, `theme` sind Local Preferences → tauchen nie in Events auf, werden nie gesynct. „Mama sieht 🍏, Papa 🍎" ist gewollt, kein Konflikt. Siehe [domain-model.md](./domain-model.md) §1 und §3.

Diese Grenze ist zugleich die Sync-Grenze der Engine (`synced: true|false` am Slice).

---

## 8. Ehrliche Schwäche: Offline-Gewinner ist „last sync wins"

Papa hakt offline um 14:00 ein Item ab, Mama ändert es online um 15:00, Papa synct um 16:00 → Papas *älteres* Event landet später im Log und gewinnt. Mit einer HLC (§4) gewänne Mama — „last edit wins", intuitiver.

Für offline-nebenläufige Edits existiert allerdings keine echte kausale Ordnung; jede deterministische Wahl ist willkürlich. Wir tauschen Uhren-Drift-Anomalien gegen Stale-Offline-Wins-Anomalien — beide selten, beide selbstkorrigierend (der Wert steht sichtbar falsch, ein Tap korrigiert ihn).

Ebenfalls sichtbar: Beim Rebase kann die UI **springen**, wenn ein fremdes Event unter eigene Pending-Events rutscht.

---

## 9. Offene Punkte

- **Konfliktsichtbarkeit in der UI:** Soll ein überschriebener eigener Wert dem Nutzer angezeigt werden („Mama hat die Menge auf 5 geändert") oder still ersetzt? Betrifft nur die Darstellung, nicht die Konvergenz.
- **Autorisierung entfernter Mitglieder:** Events eines gerade entfernten Members, die verspätet ankommen — nach Removal-Position im Log verwerfen? Der Server kann das beim Append entscheiden, weil er die Membership-Projektion besitzt (§6).
- **Log-Länge:** Ab wann wird der bestätigte Log auf dem Client gekappt (Snapshot + Tail)? Hängt am Activity Feed, der denselben Log liest.

---

## 10. Zusammenfassung

- Konflikte entstehen durch **Nebenläufigkeit**. „Append-only → keine Konflikte" gilt nur für die Speicher-Ebene; semantische Konflikte bleiben und werden beim **Falten** aufgelöst.
- **Gewählt:** server-geordnetes Log (ULID) + Client-Rebase. Der Client faltet bestätigten Stand plus eigene Pending-Events. Konvergenz **per Konstruktion**, keine Feld-Versionen, keine HLC.
- **Verworfen:** CRDT-Semantik von Hand. Sie widerspricht dem Prinzip *State ist Derived Data*, ignoriert eine bereits vorhandene zentrale Ordnung und hätte pro Feature Merge-Entscheidungen plus eine Doppel-Implementierung in Rust erfordert.
- **Voraussetzung:** granulare Intention-Events. Full-State-Events klobbern beim Rebase.
- **Preis:** Sortierung nach ULID beim Empfang, „last sync wins" bei Offline-Konflikten, sichtbare Sprünge beim Rebase.
- Autorisierung ist eine **eigene Achse** — Konvergenz schützt nicht vor unberechtigten Schreibzugriffen (§6).
