# Getting started

QuidsIn is a monorepo managed with npm workspaces. This covers Phase 1
(foundation) and Phase 2 (core financial functionality): authentication,
income, recurring expenses, accounts, and the dashboard.

## Prerequisites

- Node.js >= 24.4.0 (see `.nvmrc`)
- Docker and Docker Compose
- A Google OAuth Client ID — see "Setting up Google Sign-In" below. The API
  won't start without `GOOGLE_CLIENT_ID` configured.

## Setting up Google Sign-In

QuidsIn uses Google Sign-In for authentication — there's no email/password
option. Before running QuidsIn, create a Google OAuth Client ID:

1. In [Google Cloud Console](https://console.cloud.google.com/), go to
   **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorized JavaScript origins**, add the origin the _browser_
   will load the web app from:
   - Local Docker Compose dev: `http://localhost:5173`
   - A real deployment: your actual web origin, e.g. `https://app.example.com`
4. No redirect URI and no client secret are needed — QuidsIn only uses the
   token-based "Sign in with Google" flow, not a server-side OAuth
   redirect.
5. Copy the generated **Client ID** — you'll set it as both `GOOGLE_CLIENT_ID`
   (used server-side by the API to verify the token's audience) and
   `VITE_GOOGLE_CLIENT_ID` (used client-side to render the Sign-In button).
   Same value, two env vars, one per app. It can take a few minutes for a
   newly added authorized origin to take effect.

This is a deliberate architectural choice, not a limitation of this
release — see `IMPLEMENTATION_STATUS.md` for the reasoning and the
trade-off it makes for self-hosted deployments.

## Option A: Docker Compose (recommended)

Set `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` in your shell (or in a
`.env` file next to `deploy/docker/docker-compose.yml`), then bring up
DynamoDB Local, the API, the worker, and the web app together:

```sh
export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
docker compose -f deploy/docker/docker-compose.yml up
```

Once all services report healthy (`docker compose -f deploy/docker/docker-compose.yml ps`):

- Web: http://localhost:5173 — sign in with Google, then add income,
  recurring expenses, and accounts from the navigation.
- API health: http://localhost:3001/health
- API readiness (checks DynamoDB): http://localhost:3001/health/ready
- DynamoDB Local: http://localhost:8000

DynamoDB Local's data persists in the named volume `dynamodb-data` across
restarts (`docker compose ... down` without `-v` keeps it; `down -v` deletes
it). The application table and its index are created automatically on API
startup if they don't already exist.

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

1. Copy `.env.example` to `.env` and set `GOOGLE_CLIENT_ID` to a real value
   (see "Setting up Google Sign-In" above) — the API fails to start
   without it, the same way it already does for `DYNAMODB_ENDPOINT`. Also
   copy `apps/web/.env.example` to `apps/web/.env` and set
   `VITE_GOOGLE_CLIENT_ID` to the same Client ID.
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
