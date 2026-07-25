# Project Structure — ShopZebra

Monorepo-Struktur mit Turborepo, pnpm Workspaces und einem Rust Cargo Workspace.

---

## Übersicht

```
shopzebra/
├── apps/
│   ├── mobile/                # React + Capacitor (die eigentliche App)
│   │   ├── src/
│   │   │   ├── app/           # Store, Router, Root-Komponente
│   │   │   ├── features/      # Domänen (shopping-list, meal-plan, recipes, ...)
│   │   │   ├── ui/            # Design-System Primitives
│   │   │   └── sync/          # Event Sourcing Middleware, Offline-Queue
│   │   ├── design/            # HTML/CSS Prototypen (Referenz)
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── capacitor.config.ts
│   │
│   └── infrastructure/        # CDK (TypeScript) — kommt später
│
├── services/                  # Rust Cargo Workspace — kommt später
│
├── architecture/              # Architektur-Docs
│   └── archive/               # Alte Entscheidungen
│
├── turbo.json                 # Turborepo Config
├── pnpm-workspace.yaml        # pnpm Workspace
├── package.json               # Root package.json
└── CLAUDE.md
```

---

## Bereiche

### `apps/mobile/` — React + Capacitor

Die eigentliche ShopZebra-App. Technisch eine React-Web-App, deployed als Android/iOS-App via Capacitor. Im Browser lauffähig für Entwicklung und Tests.

Interne Struktur folgt der Bounded-Context-Struktur aus [refactoring.md](./refactoring.md) — pro Feature ein `domain/`-Subfolder plus UI-Aspekte (verbindlicher Baum: [domain-model.md](./domain-model.md) §4):
- `src/app/` — Store, Router, Root-Komponente, typed Hooks, Middlewares
- `src/app/sync/` — Sync Engine: Higher-Order Reducer, Outbox, Transport, AppSync ([sync-engine.md](./sync-engine.md) §4)
- `src/features/` — Domänen-Ordner (shopping, meal-plan, recipes, activity)
- `src/ui/` — Design-System Primitives (Button, Modal, ProgressBar)

### `apps/infrastructure/` — CDK (TypeScript)

AWS-Infrastruktur als Code. Deployed CloudFormation Stacks via CDK. Referenziert Build-Artefakte aus `services/` für Lambda-Deployments via `cargo-lambda-cdk`.

Angelegt. `ShopZebraApiStack` instanziiert bislang nur den `EventHandler`-Construct; HTTP-API, Cognito-Authorizer und DynamoDB-Tabellen fehlen noch — siehe [status.md](./status.md) §4.

### `services/` — Rust Backend

Cargo Workspace mit Lambda-Funktionen. Jede Lambda ist ein eigenes Binary, gebaut mit cargo-lambda. Gemeinsam genutzter, fachlich gekoppelter Code lebt in der Crate `lib/` (`auth.rs`, `error.rs`, `response.rs`, `runtime.rs`).

Angelegt. `event-handler` ist noch ein Gerüst — siehe [status.md](./status.md) §3.

### `apps/mobile/design/` — Prototypen

HTML/CSS-Prototypen als visuelle Referenz für die React-Implementierung. Werden nicht deployed, haben keine Build-Pipeline. Leben bei der App, weil sie deren Design dokumentieren.

---

## Tooling

| Tool | Scope | Zweck |
|------|-------|-------|
| **pnpm** | `apps/*` | Package Manager mit Workspace-Support |
| **Turborepo** | `apps/*` | Build-Orchestrierung und Caching für TypeScript-Packages |
| **Vite** | `apps/mobile` | Dev-Server und Production-Build für React |
| **Cargo** | `services/` | Rust Workspace, Build und Dependency Management |
| **cargo-lambda** | `services/` | Kompiliert Rust-Binaries für AWS Lambda (ARM64) |
| **CDK** | `apps/infrastructure` | Infrastructure as Code |

---

## Offene Entscheidungen

- **Shared Types/Contracts zwischen Frontend und Backend**: Noch nicht entschieden. Falls nötig, könnte ein `packages/contracts/`-Package entstehen (z.B. JSON Schema aus dem TypeScript- und Rust-Types generiert werden)
- **Anzahl Services**: Aktuell ein Service (`services/api/`). Kann bei Bedarf auf mehrere Services aufgeteilt werden — der Cargo Workspace unterstützt das ohne Strukturänderung
