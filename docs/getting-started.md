# Getting started

QuidsIn is a monorepo managed with npm workspaces. This covers Phase 1
(foundation), Phase 2 (core financial functionality: authentication, income,
recurring expenses, accounts, and the dashboard), and Phase 3 (optional
Plaid bank connections and transaction sync).

## Prerequisites

- Node.js >= 24.4.0 (see `.nvmrc`)
- Docker and Docker Compose
- A Google OAuth Client ID — see "Setting up Google Sign-In" below. The API
  won't start without `GOOGLE_CLIENT_ID` configured.
- A Plaid Client ID and secret (free sandbox tier) — see "Setting up Plaid
  (sandbox)" below. The API and worker won't start without `PLAID_CLIENT_ID`,
  `PLAID_SECRET`, and `ENCRYPTION_KEY` configured.

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

## Setting up Plaid (sandbox)

Bank connections are optional — everything else in QuidsIn (manual
accounts, income, expenses, the dashboard) works without Plaid configured
at all. But the API and worker both fail to start without the env vars
below, since Plaid support isn't feature-flagged off; set them even if
you don't plan to connect a real bank yet.

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com/signup) —
   the **Sandbox** environment is free and needs no approval.
2. From **Team Settings → Keys**, copy your `client_id` and the
   **Sandbox** `secret`. Set these as `PLAID_CLIENT_ID` and `PLAID_SECRET`.
3. Generate a local encryption key for Plaid access tokens at rest:
   `openssl rand -base64 32`. Set this as `ENCRYPTION_KEY`. This is
   separate from any Plaid credential — it's generated locally, never
   sent to Plaid, and protects tokens stored in your own database.
4. Leave `PLAID_WEBHOOK_URL` unset for local development — Plaid webhooks
   need a real public URL to reach you, which `localhost` isn't. Without
   it, Link is created without a webhook and the "Sync now" button (on
   the Accounts page) drives syncing instead. Set it only once you have a
   real public URL (e.g. a deployed environment, or a tunnel like ngrok)
   pointing at `POST /plaid/webhook`.
5. `PLAID_ENV` defaults to `sandbox` and `PLAID_COUNTRY_CODES` to `GB` —
   override the latter (comma-separated ISO-3166-1 alpha-2 codes, e.g.
   `GB,US`) if you want Link to show institutions from other countries.

A real end-to-end bank-connection test — completing Plaid Link against a
sandbox institution, the public-token exchange, a real sync populating the
Transactions page, disconnecting a connection — needs your own Plaid
sandbox credentials and can't be faked. Everything else (tests, typecheck,
build, and even the sync/queue logic itself, which is tested against a
fake banking provider) is fully verifiable without them.

## Option A: Docker Compose (recommended)

Set `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `PLAID_CLIENT_ID`,
`PLAID_SECRET`, and `ENCRYPTION_KEY` in your shell (or in a `.env` file next
to `deploy/docker/docker-compose.yml`), then bring up DynamoDB Local, the
API, the worker, and the web app together:

```sh
export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export PLAID_CLIENT_ID=your-plaid-sandbox-client-id
export PLAID_SECRET=your-plaid-sandbox-secret
export ENCRYPTION_KEY=$(openssl rand -base64 32)
docker compose -f deploy/docker/docker-compose.yml up
```

Once all services report healthy (`docker compose -f deploy/docker/docker-compose.yml ps`):

- Web: http://localhost:5173 — sign in with Google, then add income,
  recurring expenses, and accounts from the navigation. From the Accounts
  page, "Connect a bank" starts the Plaid Link flow; linked accounts get
  "Sync now" and "Disconnect" buttons, and their transactions show up on
  the Transactions page once synced.
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

1. Copy `.env.example` to `.env` and set `GOOGLE_CLIENT_ID`,
   `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `ENCRYPTION_KEY` to real values
   (see "Setting up Google Sign-In" and "Setting up Plaid (sandbox)"
   above) — the API and worker fail to start without them, the same way
   they already do for `DYNAMODB_ENDPOINT`. Also copy
   `apps/web/.env.example` to `apps/web/.env` and set
   `VITE_GOOGLE_CLIENT_ID` to the same Google Client ID.
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
