# Getting started

QuidsIn is a monorepo managed with npm workspaces. This covers Phase 1 — the
foundation scaffold — not any financial features yet.

## Prerequisites

- Node.js >= 24.4.0 (see `.nvmrc`)
- Docker and Docker Compose

## Option A: Docker Compose (recommended)

This brings up DynamoDB Local, the API, the worker, and the web app together:

```sh
docker compose -f deploy/docker/docker-compose.yml up
```

Once all services report healthy (`docker compose -f deploy/docker/docker-compose.yml ps`):

- Web: http://localhost:5173
- API health: http://localhost:3001/health
- API readiness (checks DynamoDB): http://localhost:3001/health/ready
- DynamoDB Local: http://localhost:8000

DynamoDB Local's data persists in the named volume `dynamodb-data` across
restarts (`docker compose ... down` without `-v` keeps it; `down -v` deletes
it).

### Known limitation of DynamoDB Local

DynamoDB Local does not support every feature of managed AWS DynamoDB
(for example some newer consistency and billing-mode behaviors). It's
intended for local development only — the Docker and AWS deployment targets
use the same repository interface (`@quidsin/database`) so swapping to real
DynamoDB later doesn't require application code changes.

Note: the `amazon/dynamodb-local` image must be at least `3.0.0` — older
versions (including the long-standard `2.5.3`) hang indefinitely on requests
from current AWS SDK v3 clients, which default to a request protocol those
older server versions don't understand. `docker-compose.yml` pins `3.3.2`.

## Option B: local processes (without Docker)

1. Copy `.env.example` to `.env` and adjust if needed.
2. Start DynamoDB Local yourself (e.g. via Docker: `docker run -p 8000:8000 amazon/dynamodb-local:3.3.2`).
3. Install dependencies: `npm install`
4. Run everything: `npm run dev`

This runs `apps/web` (Vite dev server), `apps/api`, and `apps/worker` with
file-watching via their own `dev` scripts.

## Common commands (from the repo root)

| Command                                   | What it does                                   |
| ----------------------------------------- | ---------------------------------------------- |
| `npm run lint`                            | ESLint across the whole repo                   |
| `npm run format` / `npm run format:check` | Prettier write / check                         |
| `npm run typecheck`                       | `tsc -b --force` across all Node packages/apps |
| `npm run test`                            | Vitest across all packages/apps                |
| `npm run build`                           | Full build, including the web app              |
