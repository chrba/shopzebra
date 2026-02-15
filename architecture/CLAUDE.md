# Architecture Guide

This directory contains the architectural foundation for ShopZebra. All code must follow these documents.

## Documents

- **[design-principals.md](./design-principals.md)** — Philosophical foundations (Simple Made Easy, Re-frame, Redux) and 8 design principles that govern all implementation decisions
- **[design-decisions.md](./design-decisions.md)** — Technology choices with reasoning: frontend stack, API strategy (REST), sync architecture (Event Sourcing + AppSync Events), and rejected alternatives
- **[react-best-practices.md](./react-best-practices.md)** — Concrete implementation patterns: project structure, Redux Toolkit patterns, component patterns, TypeScript conventions, testing
- **[project-structure.md](./project-structure.md)** — Monorepo-Struktur: apps/ (mobile, infrastructure), services/ (Rust), design/, Tooling (pnpm, Turborepo, cargo-lambda)
- **[product-spec.md](./product-spec.md)** — Detailed product specification: views with wireframes, navigation, features, competitor positioning

## Rules

- Design principles take precedence over convenience. When in doubt, refer to the principles.
- Every technology choice has a documented reason. Do not introduce new dependencies without evaluating them against the existing decisions.
- Best practices are not optional — they are the agreed-upon way to implement features in this codebase.
