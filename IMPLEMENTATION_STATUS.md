# Implementation Status

## Current phase

**Phase 1 — Foundation: complete.**

## Completed functionality

- npm workspaces monorepo (`apps/*`, `packages/*`) with strict TypeScript
  via project references (`tsc -b`).
- ESLint 9 flat config + Prettier, shared across the whole repo. A
  `no-restricted-imports` rule prevents `packages/core` from depending on
  Express, the AWS SDK, Plaid, or Docker.
- Vitest wired at the root with a handful of smoke tests per package/app.
- `packages/shared` — the `HealthStatus` type shared by api/worker/web.
- `packages/config` — Zod-validated environment configuration (`loadConfig`),
  shared by the api and worker.
- `packages/database` — a `HealthCheckable` interface, a real
  `DynamoDbLocalAdapter` (proven against a live DynamoDB Local instance),
  and a stub `DynamoDbAwsAdapter` seam for the future AWS deployment.
- `packages/core` — empty scaffold (domain/ports directories with READMEs
  describing what lands there in Phase 2).
- `packages/banking` — empty placeholder shell for Phase 3's Plaid work.
- `apps/api` — Express with `GET /health` (liveness) and `GET /health/ready`
  (readiness, checks DynamoDB).
- `apps/worker` — minimal Express health endpoint + heartbeat log; no real
  job processing yet.
- `apps/web` — Vite + React + TS, calls the API's `/health` on load and
  displays live status/uptime, proving the full stack is wired.
- `deploy/docker/docker-compose.yml` — four services (`dynamodb-local`,
  `api`, `worker`, `web`) with health checks, restart policies, and
  persistent DynamoDB Local storage via a named volume. Verified end to end:
  all containers healthy, `/health/ready` reports DynamoDB reachable, data
  survives a container restart.

## Outstanding work (future phases, not started)

- **Phase 2** — income/expense domain model, financial calculations,
  dashboard, account management. `packages/core`'s domain/ports directories
  are intentionally empty placeholders for this.
- **Phase 3** — Plaid integration (`packages/banking` is an empty shell
  waiting for this).
- **Phase 4** — tenant/membership model, private/shared/tenant record
  visibility, authorization enforcement, audit events. The DynamoDB access
  patterns and table design are deliberately _not_ designed yet — they
  depend on this permissions model and designing them now would risk
  building the wrong abstraction.
- **Phase 5** — AWS SAM deployment (`deploy/aws/` doesn't exist yet;
  `DynamoDbAwsAdapter` is a stub that throws `Not implemented`).
- **Phase 6** — public CI/CD and demo environment.
- **Phase 7** — private hosted edition (separate repository).
- **Phase 8** — cross-repository automation.

## Known issues / things discovered during implementation

- **`amazon/dynamodb-local` version matters a lot.** Versions before `3.0.0`
  (including the long-standard `2.5.3`) hang indefinitely — no error, no
  timeout — on requests from current AWS SDK v3 clients, which default to a
  request protocol those older server builds don't understand. This is not
  a configuration bug; it reproduces identically with the AWS CLI. Pin
  `3.3.2` or later.
- **The `amazon/dynamodb-local` image runs as a non-root user (uid 1000)**,
  and a fresh Docker named volume mounted at `/home/dynamodblocal/data` is
  created root-owned, so the server can't open its SQLite file there and
  silently crash-loops its storage thread (also presenting as a hang, not a
  clean error). The compose service sets `user: root` to avoid this. This
  is a common, previously undocumented-here gotcha with this image +
  Docker named volumes.
- Both issues above were only visible by checking `docker logs` on the
  `dynamodb-local` container — the symptom from the client side (api
  request hanging) looked identical for both causes and also for ordinary
  network misconfiguration, so don't assume network/DNS first.

## Architectural decisions (Phase 1)

See the approved plan for the full rationale; summarized:

- `packages/banking` is a real (but empty) package now, to keep the
  workspace list stable across phases, not to build banking functionality
  early.
- `packages/shared` holds only the `HealthStatus` type for now — no domain
  types until Phase 2 defines them.
- Vitest was set up now (infrastructure), even though Phase 1 has little to
  test, so it doesn't need retrofitting later.
- `packages/database`'s Phase 1 scope is connectivity-only: no domain
  tables, PK/SK design, or GSIs — those depend on the Phase 4 permissions
  model.
- Web reaches the API via an explicit, browser-reachable
  `VITE_API_BASE_URL` (not the Docker-internal service name) — no reverse
  proxy yet; one may be introduced once auth cookies/CORS make a
  single-origin setup worthwhile.
- The worker's health check is a small HTTP endpoint (same `HealthStatus`
  shape as the API) plus a heartbeat log, giving Compose a real
  machine-checkable target even before there's real job processing.
