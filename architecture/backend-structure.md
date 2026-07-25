# Backend-Struktur — Hexagonal (Rust Lambdas)

Wie das Backend in `services/` aufgebaut ist. Was das Backend fachlich tut, steht in [sync-engine.md](./sync-engine.md) §6 und [../services/events.md](../services/events.md) — dieses Dokument beschreibt nur die Code-Struktur.

**Vorbild:** [aws-samples/serverless-rust-demo](https://github.com/aws-samples/serverless-rust-demo) — Ports als Traits, Adapter am Rand, In-Memory-Implementierungen für Tests. Abweichung: Wir behalten unsere Konvention *ein Binary-Crate pro Lambda* (statt ein Crate mit `src/bin/`).

---

## Das Hexagon

Der Kern ist klein, aber sicherheitskritisch: Envelope- und Schema-Validierung, Owner/Membership-Regeln, Invite-Regeln, der ULID-Monotonie-Kontrakt. Genau das lebt im `domain`-Crate — **ohne eine einzige AWS-Dependency**, komplett in-memory testbar.

```
services/
  domain/               # das Hexagon — keine AWS-Dependencies
    schemas/            # JSON-Schema pro Event-Typ (Daten, per include_str! eingebettet)
    src/
      event.rs          # Value-Types: AggregateId, UserId, Ulid, NewEvent, StoredEvent
      envelope.rs       # Envelope- + Schema-Validierung (pure)
      membership.rs     # Owner-Modell-Regeln (pure)
      invite.rs         # Invite-Token-Regeln (pure)
      ports.rs          # Traits: EventStore, MembershipStore, InviteStore, EventPublisher, UserDirectory
      memory.rs         # In-Memory-Ports für Tests und lokales Ausführen
      usecases/         # ein Use Case pro Endpunkt (append_event, create_invite, join_list, …)

  adapters/             # Sekundär-Adapter — implementieren die Ports
    src/
      dynamodb_event_store.rs   # Conditional Put: eventId-Dedup + ULID > letzte SK (Retry)
      dynamodb_membership.rs    # (aggregateId, userId)-Projektion
      dynamodb_invites.rs
      appsync_publisher.rs
      cognito_user_directory.rs # Name-Anreicherung für listMemberAdded

  lib/                  # der RAND: Lambda-/HTTP-Utilities (auth JWT→userId, response, runtime)

  append-event/         # je Endpunkt ein Binary-Crate = dünner Driving Adapter:
  get-events/           #   Request parsen → Adapter verdrahten → Use Case → Response
  sync/
  create-invite/
  join-list/
  remove-member/
```

## Regeln

- **`domain/` importiert nichts aus `adapters/` oder `lib/`** — nur std, serde, jsonschema, async-trait. Abhängigkeitsrichtung: Binaries → adapters + domain + lib; adapters → domain.
- **Use Cases nehmen `&impl Trait`** (Generics), kein `Arc<dyn>` wo es nicht nötig ist.
- **Handler haben null Fachlichkeit:** parse → wire (einmalig, `OnceCell`) → Use Case → map Result.
- **Tests ohne Mock-Framework:** Use Cases gegen `memory.rs`-Ports. Die DynamoDB-Adapter tragen die Infrastruktur-Kontrakte (Monotonie, Dedup) und werden separat integrationsgetestet.
- **Schemas sind Daten:** neuer Klasse-1-Event-Typ = Schema-Datei in `schemas/`. Der Validator bleibt generisch; die Dateien sind später unverändert in eine Registry (DynamoDB/S3) verschiebbar.
- Der alte `event-handler/` geht in `append-event/` + `adapters/` auf und entfällt.
