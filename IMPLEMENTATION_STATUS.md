# Implementation Status

## Current phase

**Phase 7 (Part A) — the Community Edition's half of the private hosted
edition hook: complete.** The private `quidsin-hosted` repo (Part B) is
tracked there, not here. Authentication was replaced with Google Sign-In
between Phase 2 and Phase 3 (see "Authentication replaced with Google
Sign-In" below) — this superseded Phase 2's original password-based auth
before Phase 3 began.

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

### Phase 3 — Plaid Bank Connections & Transaction Sync

- **Bank connections** (`packages/core/src/application/bank-connection.service.ts`):
  `createLinkToken`/`exchangePublicToken` (exchange → encrypt the access
  token → create a `PlaidItem` → `getAccounts` → create linked `Account`
  rows with `isManual: false` → enqueue an initial sync),
  `disconnectItem` (best-effort token revocation, item marked
  `disconnected`, **accounts and transactions are kept, never deleted**),
  `triggerSync` (the self-hosted "Sync now" button — works without a
  public webhook URL).
- **Transaction sync** (`transaction-sync.service.ts`): runs in the
  worker's poll loop, not inline on a webhook request. Loops
  `BankingProvider.syncTransactions` pages, upserts added/modified
  transactions, removes removed ones, and **advances the stored cursor
  only after each page's writes are fully persisted**.
- **Transactions** (`transaction.service.ts`): list with filters
  (account/date-range/pending/search), notes editing.
- **Plaid webhooks** (`plaid-webhook.service.ts`): signature verification
  (ES256 JWT via `jose`, matching the `request_body_sha256` claim against
  the actual raw body) and payload handling — **tenantId is always
  resolved from our own stored `PlaidItem`, never trusted from the
  webhook payload**, which only ever supplies Plaid's own `item_id`.
- **`packages/banking`**: the only place the real `plaid` npm package
  (v51 — a namespaced `PlaidClient` with `.link`/`.item`/`.transactions`/
  `.accounts`/`.webhook` sub-clients, not the older flat-method
  `plaid-node` API) is imported. `PlaidBankingProvider implements
  BankingProvider`.
- **DynamoDB-backed job queue** (`DynamoDbJobQueue`): conditional-write
  enqueue coalescing (duplicate webhook deliveries for the same item
  become a no-op) and an SQS-style visibility-timeout claim, entirely
  within one partition (`pk = 'QUEUE#SYNC'`).
- **`apps/worker`** went from a health-check-only stub to a real poll
  loop: `claimNext` → `processItem` → `complete`/`fail`, with `/health`
  now reflecting actual poll-loop liveness (healthy only if a poll
  completed within the last two poll intervals) rather than just "process
  is up."
- **`apps/web`**: "Connect a bank" (via `react-plaid-link`), "Sync now"
  and "Disconnect" on linked accounts, and a new Transactions page with
  account/search/date-range/pending filters and inline notes editing.

End-to-end verified without real Plaid credentials: full test suite
(including live-DynamoDB tests proving the idempotent-upsert and
concurrent-claim guarantees) green, typecheck, lint, and build all green
across every affected package/app; the worker's poll loop verified live
against DynamoDB Local — `/health` goes healthy and a manually-inserted
queue row is claimed and completed within one poll interval. A real
end-to-end bank-connection test (completing Plaid Link, a real sync,
disconnecting a real connection) needs the user's own Plaid sandbox
credentials and is intentionally left for them to run — see
`docs/getting-started.md` ("Setting up Plaid (sandbox)").

### Phase 4 — Tenant Membership, Visibility Enforcement, Roles & Audit Events

- **Multi-tenant membership** (`packages/core/src/application/tenant-membership.service.ts`):
  a user keeps their own personal tenant (auto-created at first Google
  sign-in, as before) and can additionally belong to other tenants —
  nothing is ever merged or migrated by accepting an invite. `AuthContext`
  gained a `role: 'owner' | 'member'`, resolved fresh on every session
  validation (`AuthService.validateSession`), so removing a member revokes
  their access to that tenant immediately, not just at next login.
- **In-app invites, not email**: an invite is addressed to an email and
  stored as a pending record; it's surfaced to that person in-app (a
  banner, `GET /tenants/invites/pending`) if/when they sign in with that
  Google account. No notifier infrastructure was reintroduced (that was
  deleted with the Google Sign-In switch).
- **Two roles, Owner + Member**: the tenant's creator is its permanent
  Owner (not transferable in this phase). Owners can invite/remove
  members; Members get full read/write on their own and tenant-visible
  records but can't manage membership. An Owner can't remove themselves
  or leave their own tenant (they'd have to delete their account, and
  that's blocked while any other member remains — see below).
- **Visibility enforcement** (`packages/core/src/domain/visibility-rules.ts`'s
  `canView`): `private` is owner-only, full stop — not even the tenant
  Owner overrides it. `tenant` is visible to every current/future member.
  `shared` is an explicit per-record member list (`sharedWithUserIds` on
  `Account`/`RecurringMoneyItem`). Enforced in `list`/`getById` across
  Income/Expense/Account, in the dashboard's totals (a private record is
  excluded from a shared dashboard's aggregates entirely, not just hidden
  but still counted), and for transactions (which carry no visibility of
  their own — they inherit their owning account's).
- **Session tenant-switching**: `POST /tenants/:id/switch` re-validates
  membership and mutates the existing session row's `tenantId` in place —
  same cookie, no new `Set-Cookie`. The web app invalidates every
  tenant-scoped query on switch (`queryClient.invalidateQueries()` with no
  filter, since everything is tenant-dependent).
- **`deleteAccount` rewrite**: operates across every tenant the user
  belongs to, not just whichever tenant their current session happens to
  be scoped to — "delete my account" means delete the user, never "wipe
  whatever tenant I'm currently acting in" (which could be someone else's
  shared tenant). Validates first (refuses if the caller still owns a
  tenant with other members) and only then acts: a solo-owned tenant is
  wiped entirely (same cascade Phase 3 already did); a departing Member
  only loses their own records, leaving the tenant and its other members
  untouched.
- **Audit events** (`AuditEventRepository`): membership/invite actions
  (invited, accepted, declined, revoked, removed, left) are logged per
  tenant and readable by the Owner via `GET /tenants/audit-log` and a
  simple list in the web app's Settings page.
- **`apps/web`**: a tenant switcher in the header (only shown once there's
  actually a choice), a pending-invites banner, a "Household" section in
  Settings (members, invite form, sent invites, leave button, audit log),
  and a small Visibility control on Income/Expense/Account rows (only
  shown once the tenant has more than one member).

End-to-end verified without needing anything beyond the user's own Google
accounts: full test suite (169 tests across every package/app, including
live-DynamoDB tests for the new GSI1-backed membership/invite lookups and
the idempotent-`ensureMembership` guarantee) green, typecheck, lint, and
build all green. A real end-to-end two-account test (one real Google
account inviting another, accepting, switching tenants, setting
visibility, leaving, deleting an account once solo again) is the one
piece left for the user to run themselves — see
`docs/getting-started.md` ("Inviting someone to your tenant").

### Phase 5 — AWS SAM Deployment

- **API on Lambda behind an HTTP API**: `apps/api/src/build-server.ts`
  extracts the entire dependency-injection graph (every repository and
  service) out of `src/index.ts` into `buildApiApp(config, { database,
  dynamoClient })`, so both the self-hosted entrypoint (`src/index.ts`,
  unchanged behavior) and the new Lambda entrypoint (`src/lambda.ts`)
  share it — the only things that differ between them are the
  already-constructed DynamoDB client and health-check adapter.
  `src/lambda.ts` wraps the resulting Express app with
  `@codegenie/serverless-express`.
- **Worker on a scheduled Lambda, not a long-running container**: same
  `build-worker.ts` extraction pattern. `apps/worker/src/lambda.ts` is
  invoked every minute by an EventBridge schedule and drains the queue
  (claims and processes jobs) in a bounded loop that self-limits via
  `context.getRemainingTimeInMillis()`, rather than running the
  self-hosted entrypoint's infinite poll loop. Overlapping invocations
  are harmless — `DynamoDbJobQueue`'s conditional claim (built in Phase 3
  specifically for this) already makes concurrent claims safe.
- **Secrets fetched at runtime from SSM Parameter Store, never baked into
  the template**: `packages/config`'s new `loadConfigFromSsm` fetches and
  KMS-decrypts `GOOGLE_CLIENT_ID`/`PLAID_CLIENT_ID`/`PLAID_SECRET`/
  `ENCRYPTION_KEY` from SecureString parameters at Lambda cold start
  (cached at module scope for the life of the execution environment) —
  deliberately not via CloudFormation's `{{resolve:ssm-secure:...}}`
  dynamic references, which resolve to the literal value at deploy time
  and still end up as a plaintext Lambda environment variable.
- **`DynamoDbAwsAdapter`** (`packages/database`) is no longer a stub —
  `ping()` mirrors `DynamoDbLocalAdapter`'s exactly, just without an
  explicit endpoint/credentials override, since inside Lambda the SDK
  resolves both from the execution role automatically.
- **`deploy/aws/template.yaml`** (new SAM template): the DynamoDB table
  as a CloudFormation resource (mirroring `table/bootstrap.ts`'s schema
  exactly — `ensureTableExists` is never called on this path, same as
  the code comment already said it shouldn't be), the API and worker
  Lambdas (esbuild-bundled, ESM output — CJS doesn't support the
  top-level `await` both entrypoints use), and S3+CloudFront for the web
  app (private bucket, Origin Access Control, 403/404 → `/index.html` so
  client-side routing works).
- **`deploy/aws/deploy-web.sh`** (new): builds the web app against the
  deployed API's URL and syncs it to S3 + invalidates CloudFront — a
  script, not a pipeline (CI/CD is Phase 6).

Verified without needing a real AWS account: the new `loadConfigFromSsm`
unit test (an injected fake SSM fetch, no real AWS or LocalStack), full
typecheck/lint/test/build across every affected package, `sam validate
--lint` on the template, and — the strongest credential-free proof
available — `sam build`, which actually ran the esbuild bundling for
both Lambda entrypoints locally and succeeded (confirming the
`BuildMethod`/`CodeUri`/`Handler`/`Format` wiring is correct, not just
that the YAML parses). `sam deploy` itself, creating the SSM parameters,
and running `deploy-web.sh` against a real stack are the parts that need
the user's own AWS account and are left for them — see
`docs/deploying-to-aws.md`.

### Phase 6 — Public CI/CD and Demo Environment

- **`.github/workflows/ci.yml`** (new): a `verify` job on every PR and
  push to `main` — lint, typecheck, the full test suite against a real
  DynamoDB Local **service container** (not skipped, same pinned
  `3.3.2` image as everywhere else), the full build, and `sam validate
  --lint` + `sam build` on the Phase 5 template (a real regression
  guard for the esbuild bundling issues found by hand in that phase).
  None of this needs AWS credentials. A `deploy-demo` job then runs only
  on `main`, after `verify` passes, deploying a separate `quidsin-demo`
  SAM stack and the web app against it.
- **AWS credentials via OIDC, not stored access keys**: `deploy-demo`
  assumes an IAM role via GitHub's own OIDC provider
  (`aws-actions/configure-aws-credentials`, `id-token: write`) — nothing
  with standing AWS access ever sits in GitHub's secret store. The
  role's trust policy (`deploy/aws/github-oidc.yaml`) is scoped to
  `repo:JonnyC02/quidsin:ref:refs/heads/main` specifically, so no fork's
  PR and no other branch can ever assume it.
- **The demo stack is fully separate from any personal deployment** —
  its own `Stage: demo`, its own DynamoDB table, its own SSM parameters.
  CI/CD can never touch whatever a self-hoster deploys themselves via
  `docs/deploying-to-aws.md`.
- **No Plaid or encryption secrets ever reach GitHub** — only the
  already-public Google Client ID and the (non-sensitive) role ARN and
  region pass through as repo variables. The Plaid/encryption secrets
  stay exactly where Phase 5 put them: SSM, fetched by the Lambda itself
  at runtime, never read by the pipeline.

Verified: the OIDC bootstrap template (`github-oidc.yaml`) against the
real `aws cloudformation validate-template` API (read-only — found along
the way that `AWS::IAM::OIDCProvider` no longer needs or validates a
pinned `ThumbprintList`, so the template omits one rather than carrying
a guessed value); the workflow YAML's syntax; and a full
typecheck/lint/test/build, unchanged from Phase 5 since this phase
touches no application code. Actually exercising the pipeline — a real
PR running `verify`, a real merge running `deploy-demo`, the OIDC role
assumption actually succeeding — needs the user's own GitHub repo and
AWS account and is left for them, per `docs/ci-cd.md`.

### Phase 7 (Part A) — Private Hosted Edition: the Community Edition's hook

A second, commercial product — a privately-hosted, subscription-gated
edition, in its own private repository (`quidsin-hosted`, tracked
there, not in this repo) — is being built on top of this one. This
repo's only role in it is exposing one small, additive extensibility
seam; nothing else about the Community Edition changes.

- **New `EntitlementChecker` port** (`packages/core/src/ports/entitlement-checker.ts`):
  `canUseFeature(tenantId, feature)`, plus a trivial
  `AllowAllEntitlementChecker` default — the *only* implementation the
  Community Edition ever uses, co-located with the port the same way
  `Clock`/`SystemClock` and `IdGenerator`/`RandomUuidGenerator` already
  are.
- **`BankConnectionService.createLinkToken`/`exchangePublicToken` now
  check it first**, throwing `ForbiddenError` if not entitled.
  `disconnectItem`/`triggerSync` are deliberately **not** gated — a
  tenant whose entitlement lapses keeps existing connections syncing
  and can still disconnect them; only *creating* a new connection is
  blocked. Breaking something already running would be a worse outcome
  than just blocking new connections.
- **`buildApiApp` accepts an optional `entitlementChecker` override**,
  defaulting to `AllowAllEntitlementChecker` when omitted. This is the
  one seam the private repo's own Lambda entrypoint uses to inject a
  real Stripe-backed implementation while reusing every other line of
  the Community Edition's wiring unchanged — it never needs to fork or
  duplicate `buildApiApp`, `BankConnectionService`, or anything else.

Verified: full `packages/core`/`apps/api` test suites green (175 tests
total, +2 for the new entitlement-gating cases), typecheck, lint — this
change is indistinguishable from any other small port addition in terms
of risk, and proves zero behavior change for every self-hoster (every
existing test implicitly exercises the allow-all default and still
passes unchanged). The private repo's billing/admin/Stripe work (Part B)
is tracked in `quidsin-hosted`'s own `IMPLEMENTATION_STATUS.md`, not here.

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

- **Phase 7 (Part B)** — the private `quidsin-hosted` repo itself:
  billing data model, Stripe checkout/portal/webhook, the minimal admin
  app, and a deployment for all of it. Part A (this repo's
  `EntitlementChecker` hook) is complete; see above.
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

### Phase 3

- **The installed `plaid` npm package (v51) has a completely different
  API shape from the classic `plaid-node` `Configuration`/`PlaidApi`
  pattern** (flat, snake_case methods like `linkTokenCreate`) that most
  existing Plaid integration examples assume. The real SDK exports a
  single `PlaidClient` with namespaced sub-clients —
  `client.link.createToken`, `client.item.exchangePublicToken`,
  `client.item.remove`, `client.accounts.get`, `client.transactions.sync`,
  `client.webhook.getVerificationKey` — each returning an
  `HttpResponsePromise<T>` that resolves to the parsed body directly when
  awaited (no `.data` unwrapping needed, unlike the older SDK). Found by
  introspecting the installed package's actual `.d.ts` files rather than
  trusting training-data familiarity with the older API; writing
  `plaid-client.ts`/`plaid-banking-provider.ts` against the assumed-older
  shape would have produced code that fails at runtime with no type error
  (since nothing in `packages/core`'s tests exercises the real SDK — they
  all use `FakeBankingProvider`).
- **DynamoDB reserved keyword `cursor`.** `PlaidItemRepository.updateCursor`'s
  `UpdateExpression: 'SET cursor = ...'` failed with `ValidationException:
  ... reserved keyword: cursor`. Fixed via `ExpressionAttributeNames`
  aliasing (`#cursor`). Caught only by the live-DynamoDB integration test,
  not by `InMemoryPlaidItemRepository` — another case for why this
  project tests against real DynamoDB Local rather than fakes alone
  wherever correctness is safety-critical.
- **An empty `PLAID_WEBHOOK_URL=` line (as `.env.example` produces when
  copied verbatim) isn't `undefined`.** `z.string().url().optional()`
  still runs the `.url()` check against an empty string and fails —
  "optional" only covers the key being absent, not being present-but-empty.
  Fixed with a `z.preprocess` step that treats `''` as `undefined` before
  the rest of the schema sees it.

### Phase 4

- **`tsc -b`'s function-parameter contravariance check catches something
  `vitest` (esbuild) silently lets through.** A route test's helper
  typed a seed callback as `(token: string, identity: Record<string,
  unknown>) => void` instead of the real `FakeGoogleIdentityVerifier`
  type; `vitest run` passed anyway (esbuild strips types, no check), but
  `tsc -b --force` caught the unsound assignment immediately. Confirms
  the project's existing practice of gating on a real `tsc -b` build, not
  just the test runner, before calling anything green.
- **`AuthContext` gaining a required `role` field rippled into every test
  file that builds one as a literal** (`{ userId, tenantId }`) rather
  than through a shared helper. Fixed by locating the small number of
  shared `const ctxA = {...}` definitions per file (not dozens of inline
  literals, as it first looked) and adding `role` to each — a reminder
  that a core type change's blast radius is usually smaller than the
  raw error count suggests once you find where the literals actually
  live.

### Phase 5

- **SAM's esbuild `BuildMethod` defaults to CJS output, which doesn't
  support top-level `await`** — and both `src/lambda.ts` entrypoints use
  it (`loadConfigFromSsm` is async). `sam build` failed with `Top-level
  await is currently not supported with the "cjs" output format` until
  `BuildProperties.Format: esm` plus `OutExtension: ['.js=.mjs']` was
  added (the `.mjs` extension forces Node to load the bundle as ESM
  regardless of any nearby `package.json`, which the build output
  doesn't carry one of anyway).
- **`BuildProperties.OutExtension`'s actual expected shape isn't a
  mapping or a list of `{Key, Value}` objects — it's a list of literal
  `"<ext>=<replacement>"` strings** (`aws-lambda-builders` passes each
  list item straight through as `--out-extension:<item>` to the esbuild
  CLI). Both of the more YAML-idiomatic-looking forms fail — one with an
  opaque "failed to determine the type of the configuration" error, the
  other by literally stringifying a Python dict into the esbuild
  argument. Found by iterating against a real local `sam build`, not by
  reading the metadata schema — this specific property's shape doesn't
  match the pattern every other key-value SAM metadata property uses.
- **`esbuild` must be resolvable on `PATH`, not just present somewhere
  in `node_modules`** — `aws-lambda-builders`' Node/esbuild integration
  doesn't walk nested `node_modules` looking for it (it was already
  present transitively via `tsx`, which didn't help). Fixed by adding it
  as an explicit root devDependency and documenting that it needs to be
  put on `PATH` before running `sam build`.

## Architectural decisions

See the approved plans for full rationale; summarized:

### Phase 1

- `packages/banking` started as a real but empty package, to keep the
  workspace list stable across phases without building banking
  functionality early — filled in during Phase 3 (see below).
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

### Phase 3

1. **Idempotent transaction upsert.** `Transaction.id = Plaid's
   transaction_id` (same "external id is the id" pattern as
   `User.id = Google sub`), with no date in the DynamoDB key. A Plaid
   "modify" (which can change the date) becomes a plain `PutItem` at the
   same key, never an orphan — proved by a live-DynamoDB test that
   upserts, then upserts again with a different date and pending status,
   and asserts exactly one row survives with the updated fields. Cost:
   listing is a bounded `Query` + in-memory filter rather than a native
   date-range query, same trade-off already accepted for Income/Expense.
2. **Webhook → Item lookup via a second GSI1 prefix**, not a new index.
   Webhooks only carry Plaid's own `item_id`; `gsi1pk = PLAID_ITEM#<id>`
   reuses the existing `GSI1` with a non-colliding prefix, purely
   additive — `ensureTableExists` needed no change.
3. **Concurrent sync prevention, two layers.** `enqueueSync` is a
   conditional `PutItem` that coalesces duplicate webhook deliveries for
   the same item into a no-op; `claimNext` is an SQS-style conditional
   claim with a visibility-timeout lease. Proved by a live-DynamoDB test
   that fires two concurrent `claimNext` calls at one job and asserts
   exactly one succeeds, plus a worker-level check (two worker processes
   against one manually-inserted queue row) that only one claims it.
4. **Disconnect retention.** Accounts and transactions are kept, never
   deleted, when a bank is disconnected — only the token is revoked and
   the item marked `disconnected`. Consistent with every other retention
   choice in this app; nothing silently destroys financial history.
5. **Local AES-256-GCM token encryption via `node:crypto` only** — no new
   third-party crypto dependency, co-located in `packages/core` with its
   port, exactly like `SystemClock`/`RandomUuidGenerator`. The AWS KMS
   adapter (`apps/api/src/infra/kms-encryption.service.ts`) is an
   unwired stub seam for Phase 5, mirroring `DynamoDbAwsAdapter`.
6. **`packages/banking` is the only place the real `plaid` npm package is
   imported** — `PlaidBankingProvider implements BankingProvider`,
   mirroring how `packages/database` holds the real DynamoDB code behind
   core's repository ports.
7. **The job queue is DynamoDB-backed polling, not Redis/BullMQ** —
   confirmed with the user specifically to avoid adding new required
   infrastructure for self-hosters, mirroring the existing `Local`/`AWS`
   adapter-pair pattern already used for the database.

### Phase 4

Four design questions were resolved with the user up front; summarized
here, full rationale in the approved plan:

1. **Multi-tenant membership, not merge-on-accept.** A user keeps their
   own account and personal tenant and can additionally join other
   tenants, picking which one they're acting in per session. No existing
   user's data is ever migrated or merged by accepting an invite — the
   alternative (folding the invitee fully into the inviter's tenant)
   would have been destructive for anyone who already has their own data.
2. **In-app invites, not email.** No notifier infrastructure exists since
   the Google Sign-In switch deleted it; rebuilding one just for invites
   would have reintroduced exactly the infrastructure that switch removed.
   An invite is addressed to an email, stored as a pending record, and
   surfaced in-app on sign-in.
3. **Two roles (Owner + Member), one permanent Owner per tenant, not
   transferable.** Sized to the household/couple use case the spec
   describes, without building a role matrix nothing yet needs. Owners
   can't remove themselves or leave their own tenant — the only way out
   is deleting the account, which is itself blocked while any other
   member remains, so a tenant can never end up ownerless.
4. **Visibility: `private` is owner-only even from the Owner; `shared` is
   an explicit per-record member list; `tenant` is everyone.** The Owner
   role is purely administrative (membership management) — it was a
   deliberate choice *not* to let it double as a visibility override,
   since that would undermine the privacy a "private" record is supposed
   to guarantee for a household/couple use case.

Two further decisions made without needing a question, because the
existing code already implied a clear, defensible default:

- **A transaction has no visibility of its own — it inherits its owning
  account's.** Transactions didn't exist when visibility was first
  designed in Phase 2; giving them a redundant parallel field would have
  meant keeping two things in sync for no benefit, since a transaction is
  never independently owned or shared apart from its account.
- **A shared dashboard's totals exclude a member's private records
  entirely, not just hide them while still counting them.** The more
  conservative reading of "private" — a visible total that was secretly
  inflated by a hidden number would leak information through the total
  itself.

### Phase 5

Four design questions were resolved with the user up front; summarized
here, full rationale in the approved plan:

1. **Worker → scheduled Lambda (EventBridge, every 1 minute), not
   Fargate.** Keeps the entire deployment on one compute model (Lambda)
   instead of mixing in a second one just for the worker. The queue's
   existing conditional-claim logic (Phase 3) already tolerates
   overlapping invocations, so nothing new was needed to make this safe.
2. **Secrets via SSM Parameter Store (SecureString), fetched by the app
   at runtime.** The alternative — CloudFormation's
   `{{resolve:ssm-secure:...}}` dynamic references — resolves to the
   literal value at deploy time and still lands in the Lambda console as
   plaintext, which would have made the SecureString choice pointless.
3. **Web app on S3 + CloudFront, inside the same stack/account.** No
   second hosting provider or account to manage; one `sam deploy`
   provisions everything.
4. **No custom domain yet.** Default API Gateway/CloudFront endpoints
   keep the first deployment simpler; a domain is layerable later
   without restructuring anything built here.

Two further choices made without needing a question:

- **`samconfig.toml` is gitignored, not committed.** `sam deploy
  --guided` writes a specific stack name/region/account's choices into
  it — exactly the kind of thing a public repo shouldn't carry on behalf
  of whoever deploys their own copy. The runbook documents the
  `--guided` flow instead of shipping a template file for it.
- **`buildApiApp`/`buildWorker` take an already-constructed DynamoDB
  client and (for the API) health-check adapter, rather than building
  everything from raw config.** Those are the only two things that
  differ between the self-hosted and Lambda entrypoints — the self-hosted
  one also needs to call `ensureTableExists` first, which only makes
  sense with its own already-constructed client in hand. Passing the
  client in, instead of config flags controlling internal branching, kept
  the shared function from needing to know which environment it's in at
  all.

### Phase 6

Two design questions were resolved with the user up front:

1. **AWS credentials via OIDC federation, not long-lived access keys.**
   The same category of trade-off as Phase 5's SSM-over-dynamic-references
   choice — a bit more one-time setup (an IAM OIDC provider + role,
   deployed by hand) in exchange for nothing with standing AWS access
   ever sitting in GitHub's secret store.
2. **A separate, auto-deployed `demo` stage, not the user's own
   deployment.** Keeps CI/CD from ever being able to touch a
   self-hoster's real data — it only ever has permission (via the OIDC
   role's trust policy) to act as this repo's own pipeline, and the
   stack it deploys to (`quidsin-demo`) is independent of whatever stack
   name/stage someone runs for themselves.

One further choice made without needing a question:

- **The IAM deploy role's permissions policy is broad-but-named
  (`Resource: '*'` across CloudFormation/Lambda/DynamoDB/S3/CloudFront/
  API Gateway/EventBridge/IAM-role-management), not hand-scoped to
  per-resource ARNs.** The trust policy — which actually decides *who*
  can assume the role — is tightly scoped (this repo, main branch only);
  the permissions policy decides what it can do once assumed, and for a
  personal/demo project, hand-maintaining a least-privilege ARN list for
  every resource type SAM touches was judged not worth the ongoing
  maintenance burden relative to the security benefit, given the trust
  policy is already the real access boundary. Documented here as a
  stated trade-off rather than a silent gap.

### Phase 7 (Part A)

Of the four design questions resolved with the user for the hosted
edition as a whole, one directly shaped this repo:

- **One small, additive port, not a private fork of gated logic.** The
  alternative — the private repo duplicating `BankConnectionService` (or
  whatever needed a paywall check) entirely, so the public repo never
  depends on or knows about billing — was rejected because it trades a
  few lines of public-repo surface area for an ongoing drift risk: two
  copies of the same connection-creation logic that could silently
  diverge. A port with an always-allow default costs the Community
  Edition nothing (the test suite proves this directly) and gives the
  private repo one real extensibility seam instead of a maintenance
  liability.
- **Only `createLinkToken`/`exchangePublicToken` are gated, not
  `disconnectItem`/`triggerSync`.** Decided without needing a question —
  gating *creating new access* is the natural commercial boundary;
  breaking a connection someone already has, the moment a subscription
  lapses, is a strictly worse experience for no corresponding benefit to
  the operator, since the data (and the sync cost) already exists
  either way until they disconnect it themselves.

The other three resolutions (Stripe Checkout/Portal over custom billing
UI, the paywall boundary being Plaid specifically, and the admin app's
minimal scope) belong entirely to the private repo's own implementation
and are recorded in `quidsin-hosted`'s own `IMPLEMENTATION_STATUS.md`.
