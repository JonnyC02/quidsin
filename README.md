# QuidsIn

QuidsIn is a personal cash-flow tracker: it helps you understand how much
money comes in, how much is committed to recurring expenses, and how much
you have left each month.

This repository is the **Community Edition** — free, self-hosted, and
complete: everything needed to build, run, and deploy your own instance.
There is no feature-flagged-off "upgrade to unlock" anywhere in this
code — see [Relationship to QuidsIn Hosted](#relationship-to-quidsin-hosted)
below for the one small extension point a separate, private commercial
edition builds on top of.

## Features

- **Income, recurring expenses, and manual accounts** — CRUD, pause/resume
  without deleting, decimal-safe monthly-equivalent math.
- **Dashboard** — monthly income/expense totals, what's left, and
  chronologically-ordered upcoming payments.
- **Bank connections** (optional) — connect a real bank via
  [Plaid](https://plaid.com) for automatic transaction syncing; everything
  else works with no bank connected at all.
- **Google Sign-In** — no password to manage; see
  [`docs/getting-started.md`](docs/getting-started.md) for why.
- **Multi-person households** — share a budget with someone else without
  merging accounts: in-app invites (no email sending required), Owner/
  Member roles, and per-record visibility (private, shared with everyone,
  or shared with specific people).
- **Real AWS deployment, when you want it** — the same app runs locally
  via Docker Compose or as a serverless AWS stack (Lambda, API Gateway,
  DynamoDB, S3+CloudFront), with CI/CD included.

## Repository layout

```
apps/
  web/      React + Vite frontend
  api/      Express API (also runs as a Lambda — apps/api/src/lambda.ts)
  worker/   Background worker: drains the bank-sync queue (local loop or
            a scheduled Lambda — apps/worker/src/lambda.ts)
packages/
  core/     Domain models and business rules (infrastructure-agnostic)
  database/ Repository abstraction + DynamoDB adapters (local + AWS)
  banking/  Plaid integration
  config/   Environment-based configuration loading (env vars locally,
             SSM Parameter Store for secrets in AWS)
  shared/   Types shared between frontend and backend
deploy/
  docker/   Docker Compose for local self-hosting
  aws/      SAM template + scripts for a real AWS deployment
.github/
  workflows/ CI (every PR/push) and CD (auto-deploys a public demo stack)
docs/       Setup, deployment, and CI/CD guides (linked below)
```

## Quick start (local, Docker Compose)

```sh
export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export PLAID_CLIENT_ID=your-plaid-sandbox-client-id
export PLAID_SECRET=your-plaid-sandbox-secret
export ENCRYPTION_KEY=$(openssl rand -base64 32)
docker compose -f deploy/docker/docker-compose.yml up
```

Then visit <http://localhost:5173> and sign in with Google.

Need a Google OAuth Client ID or Plaid sandbox credentials first? Both
are free and take a few minutes — see "Setting up Google Sign-In" and
"Setting up Plaid (sandbox)" in
[`docs/getting-started.md`](docs/getting-started.md), which also covers
running without Docker, inviting someone to share your budget, and a
known DynamoDB Local limitation.

## Deploying to AWS

A real deployment — Lambda behind API Gateway, a scheduled worker
Lambda, a CloudFormation-managed DynamoDB table (with point-in-time
recovery), and S3+CloudFront for the web app — is a manual, repeatable
`sam build && sam deploy`, independent of your local Docker setup:

```sh
export PATH="$(pwd)/node_modules/.bin:$PATH"   # so sam build finds esbuild
cd deploy/aws
sam build
sam deploy --guided
```

Full walkthrough, including where secrets live (SSM `SecureString`,
fetched at runtime — never baked into the Lambda's environment as
plaintext) and deploying the web app afterwards:
[`docs/deploying-to-aws.md`](docs/deploying-to-aws.md).

Want CI on every PR and an auto-deployed demo environment on every merge
to `main`? See [`docs/ci-cd.md`](docs/ci-cd.md) — it's additive on top of
the manual deploy above and uses short-lived OIDC credentials, never a
long-lived AWS access key stored in GitHub.

## Estimated AWS cost

For one person or household's own instance, this should run **at or near
$0/month** — the architecture is entirely pay-per-use, and personal-scale
traffic sits inside AWS's (permanent, not just first-12-months) free
tiers for most of these services:

| Service                     | Typical personal usage                | Monthly cost                                            |
| --------------------------- | ------------------------------------- | ------------------------------------------------------- |
| Lambda (API + worker)       | ~5–10k requests, ~35k GB-seconds      | $0 — inside the 1M requests / 400k GB-seconds free tier |
| DynamoDB (on-demand + PITR) | a few MB, a few thousand reads/writes | <$0.05                                                  |
| API Gateway (HTTP API)      | ~5–10k requests at $1.00/million      | <$0.01                                                  |
| S3 + CloudFront             | a few MB, well under 1TB/10M requests | $0 — inside the free tier                               |
| CloudWatch Logs             | a few MB                              | <$0.05                                                  |
| **Total**                   |                                       | **roughly $0–1/month**                                  |

The worker's 1-minute EventBridge schedule (~43,800 invocations/month) is
the main _fixed_ cost driver, and it's still comfortably inside Lambda's
free tier at this scale. The main way to leave the free tier is a lot
more API traffic than one household generates (e.g. if you deploy a demo
or hand it to many people) — see QuidsIn Hosted's own cost breakdown
below for how this scales.

These are estimates based on typical usage assumptions and AWS's
pricing as of early 2026, not a bill — AWS's pricing can change, and
actual cost depends on your real traffic. Check
[AWS's current pricing](https://aws.amazon.com/pricing/) and your own
Cost Explorer after deploying.

## Development

- Node.js >= 24.4.0 (see `.nvmrc`), npm workspaces, strict TypeScript.
- From the repo root:

| Command                                   | What it does                                   |
| ----------------------------------------- | ---------------------------------------------- |
| `npm run lint`                            | ESLint across the whole repo                   |
| `npm run format` / `npm run format:check` | Prettier write / check                         |
| `npm run typecheck`                       | `tsc -b --force` across all Node packages/apps |
| `npm run test`                            | Vitest across all packages/apps                |
| `npm run build`                           | Full build, including the web app              |

## Status

Phases 1 through 6 (foundation, core financial functionality, bank
connections, multi-person households, AWS deployment, and CI/CD) are
complete. See [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) for
the detailed phase-by-phase history, architectural decisions, and
known issues discovered along the way.

## Relationship to QuidsIn Hosted

This repo defines one small, additive extension point —
`packages/core`'s `EntitlementChecker` port, which defaults to
"everything's always allowed" (`AllowAllEntitlementChecker`) and changes
nothing about self-hosted behavior. A separate, private repository
("QuidsIn Hosted") vendors this one as a git submodule and supplies a
real, Stripe-backed implementation to run bank connections as a paid
feature of a hosted, subscription service — without this repo ever
depending on Stripe, billing, or hosting concerns. If you're
self-hosting your own instance, this is invisible to you; everything
here keeps working exactly as described above.

## Contributing

This project's feature set is complete through Phase 6; contribution
guidelines will be fleshed out as the project grows beyond a solo effort.
