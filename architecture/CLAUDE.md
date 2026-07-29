# Architecture Guide

This directory contains the architectural foundation for ShopZebra. All code must follow these documents.

## Documents

- **[status.md](./status.md)** — **Zuerst lesen.** Was ist heute gebaut, was ist nur Spec? Alle übrigen Dokumente hier beschreiben den Zielzustand. Enthält außerdem die offenen Widersprüche und die drei konkurrierenden Ordner-Konventionen
- **[design-principals.md](./design-principals.md)** — Philosophical foundations (Simple Made Easy, Re-frame, Redux) and 8 design principles that govern all implementation decisions
- **[design-decisions.md](./design-decisions.md)** — Technology choices with reasoning: frontend stack, API strategy (REST), sync architecture (Event Sourcing + AppSync Events), and rejected alternatives
- **[react-best-practices.md](./react-best-practices.md)** — Concrete implementation patterns: project structure, Redux Toolkit patterns, component patterns, TypeScript conventions, testing
- **[conflict-resolution.md](./conflict-resolution.md)** — Wie gleichzeitige Änderungen mehrerer Nutzer aufgelöst werden. **Entschieden:** server-geordnetes Log (Sequenz-Positionen) + Client-Rebase, Konvergenz per Konstruktion. Verworfen: CRDT-Semantik von Hand (LWW-Register / OR-Set / HLC). Enthält außerdem die Abgrenzung zur Autorisierung
- **[sync-engine.md](./sync-engine.md)** — Der Sync-Mechanismus selbst: `withSync` als Higher-Order Reducer (confirmed / pending / rebase), Outbox, Transport, Cursor, Snapshots. Warum eine eigene Engine statt Zero/ElectricSQL/PowerSync. Klasse-1-Events vs. Klasse-2-Commands im Backend
- **[project-structure.md](./project-structure.md)** — Monorepo-Struktur: apps/ (mobile, infrastructure), services/ (Rust), design/, Tooling (pnpm, Turborepo, cargo-lambda)
- **[backend-structure.md](./backend-structure.md)** — Hexagonale Struktur der Rust-Lambdas: `domain`-Crate (Ports, Validierung, Use Cases, ohne AWS-Deps), `adapters`-Crate (DynamoDB, AppSync, Cognito), ein Binary-Crate pro Endpunkt
- **[product-spec.md](./product-spec.md)** — Detailed product specification: views with wireframes, navigation, features, competitor positioning

## Rules

- Design principles take precedence over convenience. When in doubt, refer to the principles.
- Every technology choice has a documented reason. Do not introduce new dependencies without evaluating them against the existing decisions.
- Best practices are not optional — they are the agreed-upon way to implement features in this codebase.
