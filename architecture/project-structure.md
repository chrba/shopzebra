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
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── capacitor.config.ts
│   │
│   └── infrastructure/        # CDK (TypeScript)
│       ├── lib/               # Stack-Definitionen
│       ├── bin/               # CDK App Entry
│       ├── package.json
│       └── cdk.json
│
├── services/                  # Rust Cargo Workspace
│   ├── Cargo.toml             # Workspace root
│   ├── api/                   # Lambda-Binaries für REST API
│   │   ├── Cargo.toml
│   │   └── src/
│   └── ...                    # Weitere Crates bei Bedarf, benannt nach Domäne oder Zweck
│
├── design/                    # HTML/CSS Prototypen (Referenz, nicht deployed)
│
├── architecture/              # Architektur-Docs
│
├── turbo.json                 # Turborepo Config
├── pnpm-workspace.yaml        # pnpm Workspace (apps/mobile + apps/infrastructure)
├── package.json               # Root package.json
└── CLAUDE.md
```

---

## Bereiche

### `apps/mobile/` — React + Capacitor

Die eigentliche ShopZebra-App. Technisch eine React-Web-App, deployed als Android/iOS-App via Capacitor. Im Browser lauffähig für Entwicklung und Tests.

Interne Struktur folgt der Feature-basierten Organisation aus `react-best-practices.md`:
- `src/app/` — Store, Router, Root-Komponente, typed Hooks
- `src/features/` — Domänen-Ordner (shopping-list, meal-plan, recipes, activity)
- `src/ui/` — Design-System Primitives (Button, Modal, ProgressBar)
- `src/sync/` — Event Sourcing Middleware, AppSync Events, Offline-Queue

### `apps/infrastructure/` — CDK (TypeScript)

AWS-Infrastruktur als Code. Deployed CloudFormation Stacks via CDK. Referenziert Build-Artefakte aus `services/` für Lambda-Deployments.

Aktuell ein Stack, kann bei Bedarf auf mehrere Stacks aufgeteilt werden.

### `services/` — Rust Backend

Cargo Workspace mit Lambda-Funktionen. Jede Lambda ist ein eigenes Binary, gebaut mit cargo-lambda.

- `api/` — REST API Lambdas (Event-Endpunkte, Listen-Endpunkte)
- Weitere Crates werden bei Bedarf extrahiert — benannt nach Domäne oder Zweck, kein `shared/`- oder `common/`-Crate

Wird **nicht** von Turborepo verwaltet — Rust-Builds laufen separat via `cargo-lambda build`. CDK (`apps/infrastructure/`) referenziert die kompilierten Artefakte.

### `design/` — Prototypen

HTML/CSS-Prototypen als visuelle Referenz für die React-Implementierung. Werden nicht deployed, haben keine Build-Pipeline. Aktueller Inhalt stammt aus dem ursprünglichen `src/`-Ordner.

---

## Tooling

| Tool | Scope | Zweck |
|------|-------|-------|
| **pnpm** | `apps/mobile`, `apps/infrastructure` | Package Manager mit Workspace-Support |
| **Turborepo** | `apps/mobile`, `apps/infrastructure` | Build-Orchestrierung und Caching für TypeScript-Packages |
| **Cargo** | `services/` | Rust Workspace, Build und Dependency Management |
| **cargo-lambda** | `services/` | Kompiliert Rust-Binaries für AWS Lambda (ARM64) |
| **Vite** | `apps/mobile` | Dev-Server und Production-Build für React |
| **CDK** | `apps/infrastructure` | Infrastructure as Code, deployed via `cdk deploy` |

---

## Offene Entscheidungen

- **Shared Types/Contracts zwischen Frontend und Backend**: Noch nicht entschieden. Falls nötig, könnte ein `packages/contracts/`-Package entstehen (z.B. JSON Schema aus dem TypeScript- und Rust-Types generiert werden)
- **Anzahl Services**: Aktuell ein Service (`services/api/`). Kann bei Bedarf auf mehrere Services aufgeteilt werden — der Cargo Workspace unterstützt das ohne Strukturänderung
