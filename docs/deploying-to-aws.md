# Deploying to AWS

This covers Phase 5: a real AWS deployment via SAM — an API Lambda behind
API Gateway, a scheduled worker Lambda, a CloudFormation-managed DynamoDB
table, and S3+CloudFront for the web app. It's a manual, repeatable
deployment, not a CI/CD pipeline (that's Phase 6) — you run these commands
yourself.

Everything here is additive: Docker Compose / local processes (see
`docs/getting-started.md`) keep working exactly as before. This is a
second, independent way to run QuidsIn, not a replacement.

## Prerequisites

- An AWS account and credentials configured locally (`aws configure`, or
  an SSO profile — anything `aws sts get-caller-identity` succeeds with).
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).
- `esbuild` resolvable on your `PATH` (SAM's Node.js build uses it
  directly, not via npm). It's already a root devDependency of this repo
  (`npm install` at the repo root installs it into `node_modules/.bin`) —
  add that to your `PATH` before running `sam build`, e.g.:
  ```sh
  export PATH="$(pwd)/node_modules/.bin:$PATH"
  ```
- Your own Google OAuth Client ID and Plaid sandbox credentials — see
  "Setting up Google Sign-In" and "Setting up Plaid (sandbox)" in
  `docs/getting-started.md` if you don't have these yet.

## Why secrets are SSM parameters, fetched at runtime — not template values

`GOOGLE_CLIENT_ID`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `ENCRYPTION_KEY`
are stored as SSM **SecureString** parameters. The app fetches and
decrypts them itself at Lambda cold start (`packages/config`'s
`loadConfigFromSsm`, cached for the life of the execution environment) —
they are deliberately *not* wired into the SAM template via
CloudFormation's `{{resolve:ssm-secure:...}}` dynamic references. That
mechanism resolves to the literal secret value at deploy time and bakes
it into the Lambda's environment variables as plaintext, visible in the
Lambda console and CloudTrail — which defeats the point of choosing
SecureString in the first place.

## 1. Create the SSM parameters

Pick a stage name (`dev` is the default the template expects unless you
override it). Replace the placeholder values:

```sh
STAGE=dev

aws ssm put-parameter --type SecureString \
  --name "/quidsin/${STAGE}/google-client-id" \
  --value "your-client-id.apps.googleusercontent.com"

aws ssm put-parameter --type SecureString \
  --name "/quidsin/${STAGE}/plaid-client-id" \
  --value "your-plaid-client-id"

aws ssm put-parameter --type SecureString \
  --name "/quidsin/${STAGE}/plaid-secret" \
  --value "your-plaid-sandbox-secret"

aws ssm put-parameter --type SecureString \
  --name "/quidsin/${STAGE}/encryption-key" \
  --value "$(openssl rand -base64 32)"
```

## 2. Build and deploy the API, worker, and DynamoDB table

```sh
export PATH="$(pwd)/node_modules/.bin:$PATH"   # so sam build finds esbuild
cd deploy/aws
sam build
sam deploy --guided
```

`--guided` walks you through the stack name, region, and the `Stage`/
`PlaidEnv`/`PlaidCountryCodes` template parameters (defaults: `dev`,
`sandbox`, `GB`), and writes your choices to a local `samconfig.toml`
(gitignored — this is deliberately never committed, since a public repo
shouldn't carry anyone's specific stack name/region/account choices).
Confirm the IAM capability prompt (`CAPABILITY_IAM`) — the stack creates
execution roles for both Lambdas.

On later deploys, once `samconfig.toml` exists, just `sam build && sam deploy`.

When it finishes, note the outputs:

```sh
aws cloudformation describe-stacks --stack-name <your-stack-name> \
  --query 'Stacks[0].Outputs'
```

You need `ApiUrl`, `WebBucketName`, and `WebDistributionId` for the next step.

## 3. Build and deploy the web app

```sh
VITE_API_BASE_URL=<ApiUrl from the outputs above> \
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com \
WEB_BUCKET_NAME=<WebBucketName from the outputs above> \
WEB_DISTRIBUTION_ID=<WebDistributionId from the outputs above> \
  ./deploy/aws/deploy-web.sh
```

This builds `apps/web` against your deployed API, syncs the static files
to S3, and invalidates the CloudFront cache so the new build is served
immediately.

## 4. Verify

```sh
curl https://<ApiUrl>/health
curl https://<ApiUrl>/health/ready   # checks DynamoDB connectivity too
```

Then open the `WebUrl` output in a browser and sign in with Google. A
real end-to-end check (actually signing in, connecting a Plaid sandbox
account, syncing transactions) needs your own Google/Plaid credentials
and is the one piece only you can run — the same framing as the Plaid
and Google checklists in earlier phases.

The worker's EventBridge schedule starts firing immediately after
deploy (every 1 minute); there's no separate step to start it. Check
`aws logs tail /aws/lambda/<stack-name>-WorkerFunction-xxxx --follow` to
watch it run.

## Cost

Everything here is pay-per-use: DynamoDB `PAY_PER_REQUEST`, Lambda's
free tier (1M requests/month), S3, and CloudFront's free tier. At low
personal-use traffic this should run at or near $0/month; the worker's
1-minute schedule is its main fixed cost (~43,800 invocations/month,
still well inside Lambda's free tier on its own).

## Tearing down

```sh
cd deploy/aws
sam delete
```

This deletes the stack, including the DynamoDB table and all its data —
same destructive-by-nature caveat as deleting any database. The SSM
parameters created in step 1 are **not** managed by the stack and are
not deleted by `sam delete`; remove them yourself with
`aws ssm delete-parameter` if you want them gone too.
