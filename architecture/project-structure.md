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

Interne Struktur folgt der Feature-basierten Organisation aus `react-best-practices.md`:
- `src/app/` — Store, Router, Root-Komponente, typed Hooks
- `src/features/` — Domänen-Ordner (shopping-list, meal-plan, recipes, activity)
- `src/ui/` — Design-System Primitives (Button, Modal, ProgressBar)
- `src/sync/` — Event Sourcing Middleware, AppSync Events, Offline-Queue

### `apps/infrastructure/` — CDK (TypeScript) — kommt später

AWS-Infrastruktur als Code. Deployed CloudFormation Stacks via CDK. Referenziert Build-Artefakte aus `services/` für Lambda-Deployments. Wird angelegt, sobald das Backend entwickelt wird.

### `services/` — Rust Backend — kommt später

Cargo Workspace mit Lambda-Funktionen. Jede Lambda ist ein eigenes Binary, gebaut mit cargo-lambda. Wird angelegt, sobald die API-Schicht implementiert wird.

### `apps/mobile/design/` — Prototypen

HTML/CSS-Prototypen als visuelle Referenz für die React-Implementierung. Werden nicht deployed, haben keine Build-Pipeline. Leben bei der App, weil sie deren Design dokumentieren.

---

## Tooling

| Tool | Scope | Zweck |
|------|-------|-------|
| **pnpm** | `apps/*` | Package Manager mit Workspace-Support |
| **Turborepo** | `apps/*` | Build-Orchestrierung und Caching für TypeScript-Packages |
| **Vite** | `apps/mobile` | Dev-Server und Production-Build für React |
| **Cargo** | `services/` | Rust Workspace, Build und Dependency Management — kommt später |
| **cargo-lambda** | `services/` | Kompiliert Rust-Binaries für AWS Lambda (ARM64) — kommt später |
| **CDK** | `apps/infrastructure` | Infrastructure as Code — kommt später |

---

## Offene Entscheidungen

- **Shared Types/Contracts zwischen Frontend und Backend**: Noch nicht entschieden. Falls nötig, könnte ein `packages/contracts/`-Package entstehen (z.B. JSON Schema aus dem TypeScript- und Rust-Types generiert werden)
- **Anzahl Services**: Aktuell ein Service (`services/api/`). Kann bei Bedarf auf mehrere Services aufgeteilt werden — der Cargo Workspace unterstützt das ohne Strukturänderung
