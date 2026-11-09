# Implementation Status

## Current phase

**Phase 2 — Core Financial Functionality: complete.** Authentication was
subsequently replaced with Google Sign-In (see "Authentication replaced
with Google Sign-In" below) — this superseded Phase 2's original
password-based auth before Phase 3 began.

## Completed functionality

### Phase 1 — Foundation

- npm workspaces monorepo (`apps/*`, `packages/*`) with strict TypeScript
  via project references (`tsc -b`).
- ESLint 9 flat config + Prettier, shared across the whole repo. A
  `no-restricted-imports` rule prevents `packages/core` from depending on
  Express, the AWS SDK, Plaid, or Docker.
- Vitest wired at the root with a handful of smoke tests per package/app.
- `deploy/docker/docker-compose.yml` — four services (`dynamodb-local`,
  `api`, `worker`, `web`) with health checks, restart policies, and
  persistent DynamoDB Local storage via a named volume.

### Phase 2 — Core Financial Functionality

- **Authentication** (`packages/core/src/application/auth.service.ts`):
  originally shipped as email/password (Argon2id hashing, token-based
  password reset). **Replaced with Google Sign-In** shortly after Phase 2
  — see the dedicated section below for the current mechanism.
- **Income / recurring expenses** (`IncomeService`/`ExpenseService`,
  sharing `RecurringMoneyItemService<T>`): CRUD, pause/resume without
  deleting, decimal-safe monthly-equivalent calculation via `decimal.js`
  (late rounding — sums are rounded once at the end, not per item).
- **Accounts** (`AccountService`): CRUD, a separate `updateBalance`
  method, manual-only (`isManual: true`) in this phase.
- **Dashboard** (`DashboardService`): monthly income/expense totals,
  remaining monthly income, chronologically-ordered upcoming payments
  (via `nextOccurrence`), `isEmpty` flag for the frontend empty state.
- **DynamoDB schema** (`packages/database`): single table, `pk`/`sk` +
  one GSI (`GSI1`) for session/reset-token lookup by user. Real
  repositories for every entity, all tenant-scoped by partition key
  derived from the authenticated session — cross-tenant reads aren't
  reachable even before the defensive `ownerId` check. Verified against a
  live DynamoDB Local instance, including tenant isolation.
- **`apps/api`**: full route set (`/auth/*`, `/income`, `/expenses`,
  `/accounts`, `/dashboard`), `requireAuth` cookie middleware, zod request
  validation, a central error handler mapping core error classes to HTTP
  status codes. CORS now configured (`WEB_ORIGIN`) — required for
  cross-origin cookie auth, which Phase 1 didn't need.
- **`apps/web`**: React Router (public vs. protected route groups),
  TanStack Query (session state mirrors the httpOnly cookie, not stored
  client-side), Tailwind CSS v4, Recharts. Pages for login (now Google
  Sign-In — see below), Overview (dashboard), Income, Expenses, Accounts,
  Settings (account deletion). The Overview chart is a snapshot
  income-vs-expenses bar chart, not a time series — there's no transaction
  history yet to plot a trend from.
- `packages/shared` gained `money.ts` (`parseAmountToMinorUnits`,
  `formatMinorUnits`, via `decimal.js`) — the one place decimal-safe
  amount parsing happens, used by the frontend's forms.

End-to-end verified via `docker compose up`: create a non-round weekly
income and quarterly expense → dashboard totals match hand-calculated
values exactly → log out/in → delete account → re-sign-in (proves cleanup
actually happened). (Originally verified against password-based
register/login/password-reset before the Google Sign-In replacement; see
below for the current auth flow's own verification.)

## Authentication replaced with Google Sign-In

Shortly after Phase 2 shipped, authentication was replaced entirely —
not extended — with Google Sign-In ("go all in on Google" was the
explicit instruction). Password hashing, password reset, and all email
notifier infrastructure were deleted outright.

**Mechanism**: Google Identity Services (GIS) ID-token flow, not a
server-side OAuth redirect. `apps/web` renders Google's hosted Sign-In
button (`@react-oauth/google`); on success the browser already holds a
Google-signed ID token, which gets POSTed to `POST /auth/google`.
`apps/api/src/infra/google-identity-verifier.ts` verifies it server-side
via `google-auth-library`'s `OAuth2Client.verifyIdToken()` (audience =
`GOOGLE_CLIENT_ID`). No client secret, no redirect URI, no CSRF state
parameter to manage — Google signs the token and handles the entire
browser-side flow. `packages/core` stays infrastructure-free: it defines
a `GoogleIdentityVerifier` port, `apps/api` is the only place
`google-auth-library` is imported (also added to the `no-restricted-imports`
ESLint rule for `packages/core/**` as defense-in-depth).

**`User.id` is the Google `sub` claim directly** — it's already globally
unique and permanent, so there's no separate generated UUID and no
separate uniqueness-lock record (the old `EmailLock` pattern is gone
entirely). `DynamoUserRepository.findOrCreateByGoogleProfile` provisions
with a plain conditional `PutItem` (`attribute_not_exists(pk)`) on the
user's own primary key; the losing side of a first-sign-in race just
falls back to a read. One fewer item type, one fewer lookup, one fewer
`TransactWriteCommand` versus the password-based flow it replaced.

End-to-end verified with a real Google account via `docker compose up`:
Sign-In button renders → real Google sign-in → redirect to `/overview` and
session persists across a refresh → income/expense/account CRUD unaffected
→ sign out → 401 on `/auth/me` → delete account → sign in again with the
same Google account → fresh empty tenant provisioned (no leftover lock
artifact). Automated coverage (unit + integration + route tests) uses a
`FakeGoogleIdentityVerifier` test double — nothing in the test suite calls
real Google infrastructure.

**Deliberate, acknowledged trade-off**: this walks back the original
master spec's requirement that Community Edition authentication work
"without relying on a third-party hosted authentication service."
Self-hosted QuidsIn now requires a Google Cloud OAuth Client ID to
function at all — there is no password fallback. This was a conscious
choice made after that trade-off was explained, not an oversight.

## Outstanding work (future phases, not started)

- **Phase 3** — Plaid integration (`packages/banking` is an empty shell
  waiting for this).
- **Phase 4** — tenant membership (multiple users per tenant), record
  visibility _enforcement_ (`visibility` is a real attribute on every
  record already, but Phase 2 never sets it to anything but `"private"`
  or checks it), roles, audit events.
- **Phase 5** — AWS SAM deployment (`deploy/aws/` doesn't exist yet;
  `DynamoDbAwsAdapter` is a stub; `ensureTableExists` is a dev/self-hosted
  convenience, not a production provisioning mechanism).
- **Phase 6** — public CI/CD and demo environment.
- **Phase 7** — private hosted edition (separate repository).
- **Phase 8** — cross-repository automation.

## Known issues / things discovered during implementation

### Phase 1

- **`amazon/dynamodb-local` version matters a lot.** Versions before `3.0.0`
  (including the long-standard `2.5.3`) hang indefinitely — no error, no
  timeout — on requests from current AWS SDK v3 clients, which default to a
  request protocol those older server builds don't understand. Pin `3.3.2`
  or later.
- **The `amazon/dynamodb-local` image runs as a non-root user (uid 1000)**,
  and a fresh Docker named volume mounted at `/home/dynamodblocal/data` is
  created root-owned, so the server can't open its SQLite file there and
  silently crash-loops its storage thread (also presenting as a hang, not
  a clean error). The compose service sets `user: root` to avoid this.

### Phase 2

- **`markUsed` must key by the token hash, not the token's own `id`.** The
  password-reset-token table is keyed by `tokenHash` (that's the only
  value available at lookup time — a reset link only carries the raw
  token). An early version of the port took an `id`, which doesn't match
  any real lookup key; caught before it shipped by writing the DynamoDB
  repository against the port and noticing the key shapes didn't line up.
- **Stale `tsconfig.tsbuildinfo` files silently broke the web Docker
  image.** `tsc -b`'s "is this project up to date" check compares the
  `.tsbuildinfo` timestamp against source file timestamps — it does
  _not_ verify the declared output files (`dist/*.js`) actually exist.
  `.dockerignore` excluded `**/dist` (correct — each image should build
  its own) but not `**/*.tsbuildinfo`, so a tsbuildinfo already "up to
  date" from host-side builds got copied into the image's build context,
  convincing `tsc -b` that `packages/shared`/`packages/core` were already
  built when their `dist/` had never actually been emitted inside the
  image. Symptom: Vite's dependency scanner failing to resolve
  `@quidsin/core`/`@quidsin/shared` at runtime, with no error at build
  time. Fixed by adding `**/*.tsbuildinfo` to `.dockerignore` and passing
  `--force` to every Docker-internal `tsc -b` call (defense in depth —
  `apps/api`/`apps/worker` already had `--force` from Phase 1, which is
  why only the web image hit this).
- **Vite's dependency-scan warns about `node:crypto` being "externalized"**
  when building `apps/web`, because `@quidsin/core`'s barrel file
  re-exports `AuthService` (which imports `node:crypto`) alongside the
  pure, browser-safe calculation functions the frontend actually uses.
  Verified harmless by grepping the production bundle: none of the
  backend-only code (`AuthService`, `sha256Hex`, etc.) is actually present
  in the output — tree-shaking correctly drops it; the warning is just a
  resolution-phase scan artifact, not a sign of bundled dead code.
- **The web dev server 500'd on every real (non-type-only) import from
  `@quidsin/core`/`@quidsin/shared`, only visible once an actual browser
  loaded the page** (a curl spot-check of the importing file's own
  transform doesn't trigger transformation of the imported module, so
  this went undetected until Playwright MCP was wired up and used to
  click through the app). Cause: `@quidsin/*` are npm-workspace symlinks;
  Vite's default `resolve.preserveSymlinks: false` resolves them to their
  real path under `packages/*` and then treats the already-built
  `dist/*.js` as project _source_ rather than a dependency, running it
  through the TS-aware `vite:oxc` transform. That transform does a
  tsconfig lookup, finds `packages/{core,shared}/tsconfig.json` right next
  to the `dist/` folder, but that tsconfig's `include: ["src"]` doesn't
  cover `dist/`, so resolution falls through to unrelated project-reference
  entries in the root `tsconfig.json` and fails. Fixed by setting
  `resolve.preserveSymlinks: true` in `apps/web/vite.config.ts`, which
  keeps Vite treating workspace packages as ordinary dependencies.

## Architectural decisions

See the approved plans for full rationale; summarized:

### Phase 1

- `packages/banking` is a real (but empty) package, to keep the workspace
  list stable across phases without building banking functionality early.
- Web reaches the API via an explicit, browser-reachable
  `VITE_API_BASE_URL` (not the Docker-internal service name).
- The worker's health check is a small HTTP endpoint plus a heartbeat
  log, giving Compose a real machine-checkable target even before there's
  real job processing.

### Phase 2

- **Single DynamoDB table**, `PAY_PER_REQUEST`, one GSI. Justified because
  every entity is already tenant/owner/visibility-scoped and access
  patterns are simple key/prefix queries — multiple tables would just be
  provisioning overhead for one operationally-single dataset.
- **Sessions are DynamoDB-backed, not JWTs** — the cookie holds only an
  opaque id, so logout/revocation is real (useful later for Phase 4 admin
  actions), at the cost of a lookup per authenticated request.
- **Money is stored as integer minor units**, but the five frequency
  formulas use `decimal.js` (not plain float math) because they don't
  divide evenly. Dashboard totals sum unrounded values and round once —
  rounding each item first and summing would compound error.
- **Every user gets one personal tenant automatically at registration.**
  Records carry `tenantId`/`ownerId`/`visibility` from day one so Phase
  4's sharing/roles work doesn't require a schema migration, even though
  Phase 2 doesn't enforce sharing (there's no invitation flow yet).
- ~~Password reset ships now, behind a `Notifier` port with a console-log
  default adapter~~ — superseded: password auth (and reset) was removed
  entirely when auth was replaced with Google Sign-In; see "Authentication
  replaced with Google Sign-In" above.
- Income/expense records have no `currency` field (the spec's field list
  for them omits it) — treated as single-currency-per-tenant for Phase 2.
  Accounts keep their own `currency` and are shown individually, not
  summed across currencies, on the dashboard.
- "Expected payment date/day" is modeled as one `anchorDate` (ISO date),
  stepped forward by frequency via `nextOccurrence` — a day-of-month
  integer doesn't generalize to weekly/fortnightly cadences.
- The dashboard's cash-flow visualization is a snapshot income-vs-expenses
  bar chart, not a time series, since Phase 2 has no transaction history.
