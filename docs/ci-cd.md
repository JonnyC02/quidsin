# CI/CD and the demo environment

This covers Phase 6: GitHub Actions CI on every PR, and CD that
auto-deploys a public **demo** stack on every merge to `main`. It's
layered entirely on Phase 5's existing SAM template — nothing new is
provisioned here beyond the pipeline itself and a one-time IAM bootstrap.

This has no effect on, and no opinion about, however you run your own
personal copy — that stays exactly the manual `sam deploy` from
`docs/deploying-to-aws.md`, on purpose, so CI/CD can never accidentally
redeploy over anyone's real data. The demo stack (`Stage: demo`) is
completely separate from any stack you deploy yourself.

## What runs, and when

- **`verify`** (`.github/workflows/ci.yml`) — every pull request and
  every push to `main`. Lint, typecheck, the full test suite (against a
  real DynamoDB Local service container, not skipped), the full build,
  and `sam validate --lint` + `sam build` on the SAM template. No AWS
  credentials are used or needed for this job.
- **`deploy-demo`** — only on a push (or manual `workflow_dispatch`)
  against `main`, and only after `verify` passes. Deploys the
  `quidsin-demo` SAM stack, then builds and deploys the web app against
  it.

## One-time setup (you do this once, by hand)

### 1. Create the OIDC provider and deploy role

```sh
aws cloudformation deploy \
  --template-file deploy/aws/github-oidc.yaml \
  --stack-name quidsin-github-oidc \
  --capabilities CAPABILITY_NAMED_IAM
```

If your AWS account already has a GitHub OIDC provider from another
project (an account can only have one), pass
`--parameter-overrides CreateOidcProvider=false ExistingOidcProviderArn=<its ARN>`
instead.

Read the role ARN back out:

```sh
aws cloudformation describe-stacks --stack-name quidsin-github-oidc \
  --query 'Stacks[0].Outputs[0].OutputValue' --output text
```

### 2. Create the demo environment's SSM parameters

Same as `docs/deploying-to-aws.md`'s step 1, with `Stage=demo`:

```sh
STAGE=demo

aws ssm put-parameter --type SecureString \
  --name "/quidsin/${STAGE}/google-client-id" --value "your-client-id.apps.googleusercontent.com"
aws ssm put-parameter --type SecureString \
  --name "/quidsin/${STAGE}/plaid-client-id" --value "your-plaid-client-id"
aws ssm put-parameter --type SecureString \
  --name "/quidsin/${STAGE}/plaid-secret" --value "your-plaid-sandbox-secret"
aws ssm put-parameter --type SecureString \
  --name "/quidsin/${STAGE}/encryption-key" --value "$(openssl rand -base64 32)"
```

CI/CD never creates, reads, or touches these directly — the demo
Lambdas fetch them at runtime exactly like any other stage.

### 3. Set the GitHub repo variables

In the repo → Settings → Secrets and variables → Actions → **Variables**
tab (not Secrets — none of these are sensitive):

| Variable | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | the role ARN from step 1 |
| `AWS_REGION` | the AWS region you're deploying to |
| `VITE_GOOGLE_CLIENT_ID` | the same public OAuth Client ID used elsewhere |

Nothing else goes into GitHub at all — no Plaid credentials, no
encryption key, no AWS access keys. The `id-token: write` permission on
the `deploy-demo` job is what lets it assume the role via OIDC; there's
no standing credential sitting in the repo's secret store.

## Day to day

Open a PR — `verify` runs automatically. Merge to `main` — `verify` runs
again, then `deploy-demo` redeploys the demo stack and web app. To
redeploy without a new commit, use the **Run workflow** button on the
`CI/CD` workflow in the Actions tab (`workflow_dispatch`).

## Tearing down the demo environment

```sh
cd deploy/aws
sam delete --stack-name quidsin-demo
```

This deletes the demo stack, including its DynamoDB table and all its
data. It does **not** delete the SSM parameters from step 2 or the OIDC
bootstrap stack from step 1 — remove those separately
(`aws ssm delete-parameter` / `aws cloudformation delete-stack
--stack-name quidsin-github-oidc`) if you want them gone too.
