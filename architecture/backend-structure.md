# Backend-Struktur — Hexagonal (Rust Lambdas)

Wie das Backend in `services/` aufgebaut ist. Was das Backend fachlich tut, steht in [sync-engine.md](./sync-engine.md) §6 und [../services/events.md](../services/events.md) — dieses Dokument beschreibt nur die Code-Struktur.

**Vorbild:** [aws-samples/serverless-rust-demo](https://github.com/aws-samples/serverless-rust-demo) — Ports als Traits, Adapter am Rand, In-Memory-Implementierungen für Tests. Abweichung: Wir behalten unsere Konvention *ein Binary-Crate pro Lambda* (statt ein Crate mit `src/bin/`).

---

## Das Hexagon

Der Kern ist klein, aber sicherheitskritisch: Envelope- und Schema-Validierung, Owner/Membership-Regeln, Invite-Regeln, der Positions-Monotonie-Kontrakt. Genau das lebt im `domain`-Crate — **ohne eine einzige AWS-Dependency**, komplett in-memory testbar.

```
services/
  domain/               # das Hexagon — keine AWS-Dependencies
    schemas/            # JSON-Schema pro Event-Typ (Daten, per include_str! eingebettet)
    src/
      event.rs          # Value-Types: AggregateId, UserId, Position, NewEvent, StoredEvent
      envelope.rs       # Envelope- + Schema-Validierung (pure)
      membership.rs     # Owner-Modell-Regeln (pure)
      invite.rs         # Invite-Token-Regeln (pure)
      ports.rs          # Traits: EventStore, MembershipStore, InviteStore, EventPublisher, UserDirectory
      memory.rs         # In-Memory-Ports für Tests und lokales Ausführen
      usecases/         # ein Use Case pro Endpunkt (append_event, create_invite, join_list, …)

  adapters/             # Sekundär-Adapter — implementieren die Ports
    src/
      dynamodb_event_store.rs   # Conditional Puts: Position = letzte + 1, eventId-Dedup (Retry bei verlorenem Rennen)
      dynamodb_membership.rs    # (aggregateId, userId)-Projektion
      dynamodb_invites.rs
      appsync_publisher.rs
      cognito_user_directory.rs # Name-Anreicherung für listMemberAdded

  lib/                  # der RAND: Lambda-/HTTP-Utilities (auth JWT→userId, error, response, wire)

  lambdas/              # alle Einstiegspunkte, per Glob im Workspace (members = ["lambdas/*"])
    append-event/       # je Endpunkt ein Binary-Crate = dünner Driving Adapter:
    create-list/        #   Request parsen → Ports verdrahten → Use Case → Response
    get-events/         # Cursor-Catch-up pro Liste (?since=<position>)
    get-lists/          # Membership-Auskunft für Bootstrap + Reconnect-Fanout
    …geplant: create-invite/, join-list/, remove-member/
```

**Warum `lambdas/` als Gruppierung:** Auf der obersten Ebene liegen sonst zwei verschiedene Sorten von Crates nebeneinander — drei Architektur-Crates (Library) und eine mit jedem Endpunkt wachsende Menge Deployment-Artefakte (Binary). Bei 12+ Endpunkten gehen die tragenden drei im Rauschen unter. Die Gruppierung trennt „was das System ist" von „wo es betreten wird"; eine neue Lambda ist ein Ordner unter `lambdas/`, der Workspace-Glob nimmt sie automatisch auf. Cargo-Workspaces sind intern flach — die Verzeichnisebene ist reine Lesbarkeit und kostet nichts. (Path-Dependencies der Binaries zeigen auf `../../domain` etc., CDK-`manifestPath` auf `services/lambdas/<name>`.)

## Regeln

- **`domain/` importiert nichts aus `adapters/` oder `lib/`** — nur std, serde, jsonschema, async-trait. Abhängigkeitsrichtung: Binaries → adapters + domain + lib; adapters → domain.
- **Use Cases nehmen `&Ports`** — ein Bündel aus drei `&dyn`-Referenzen (`events`, `membership`, `broadcast`), einmal pro Cold Start verdrahtet. Verdrahtung und Request-Daten bleiben in der Signatur sichtbar getrennt (`append_event(&ports, &caller, &aggregate, request)`). Bewusst `dyn` statt Generics: `#[async_trait]` boxt ohnehin jede Future, der statische Dispatch hätte nur Typparameter-Lärm gekauft.
- **Handler haben null Fachlichkeit:** parse → wire (einmalig, `OnceCell`) → Use Case → map Result.
- **Tests ohne Mock-Framework:** Use Cases gegen `memory.rs`-Ports. Die DynamoDB-Adapter tragen die Infrastruktur-Kontrakte (Monotonie, Dedup) und werden separat integrationsgetestet.
- **Schemas sind Daten:** neuer Klasse-1-Event-Typ = Schema-Datei in `schemas/`. Der Validator bleibt generisch; die Dateien sind später unverändert in eine Registry (DynamoDB/S3) verschiebbar.
- ~~Der alte `event-handler/` geht in `append-event/` + `adapters/` auf und entfällt.~~ ✅ entfernt (2026-07-27), ebenso `hello/`.
