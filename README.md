# QuidsIn

QuidsIn is a personal cash-flow tracker: it helps you understand how much
money comes in, how much is committed to recurring expenses, and how much
you have left each month — without requiring a connected bank account or a
complicated budgeting setup.

This repository is the Community Edition: everything needed to build and
self-host QuidsIn.

## Status

This repository currently contains **Phase 1 — Foundation**: the monorepo
scaffold, shared tooling, and a thin vertical slice (web → api → worker →
DynamoDB Local) proving the stack boots and talks to itself via health
checks. No financial features exist yet. See `IMPLEMENTATION_STATUS.md` for
the current phase and what's planned next.

## Repository layout

```
apps/
  web/      React + Vite frontend
  api/      Express API
  worker/   Background worker
packages/
  core/     Domain models and business rules (infrastructure-agnostic)
  database/ Repository abstraction + DynamoDB adapters
  banking/  Plaid integration (placeholder — lands in a later phase)
  config/   Environment-based configuration loading
  shared/   Types shared between frontend and backend
deploy/
  docker/   Docker Compose for local self-hosting
docs/       Documentation
```

## Quick start

```sh
docker compose -f deploy/docker/docker-compose.yml up
```

Then visit http://localhost:5173. See `docs/getting-started.md` for details,
including running without Docker.

## Development

- Node.js >= 24.4.0, npm workspaces, strict TypeScript.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` from
  the repo root.

## Contributing

This project is still in its foundational phase; contribution guidelines
will be fleshed out as the feature set grows.
