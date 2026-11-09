#!/usr/bin/env bash
set -euo pipefail

# Builds the web app against a deployed API and syncs it to the SAM
# stack's S3 bucket + CloudFront distribution. Run this *after*
# `sam deploy` — it needs that deployment's ApiUrl, WebBucketName, and
# WebDistributionId stack outputs. See docs/deploying-to-aws.md.
#
# Usage:
#   VITE_API_BASE_URL=https://xxxx.execute-api.region.amazonaws.com \
#   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com \
#   WEB_BUCKET_NAME=quidsin-dev-webbucket-xxxx \
#   WEB_DISTRIBUTION_ID=EXXXXXXXXXXXXX \
#     ./deploy/aws/deploy-web.sh

: "${VITE_API_BASE_URL:?Set VITE_API_BASE_URL to the stack ApiUrl output}"
: "${VITE_GOOGLE_CLIENT_ID:?Set VITE_GOOGLE_CLIENT_ID to the same public OAuth Client ID used elsewhere}"
: "${WEB_BUCKET_NAME:?Set WEB_BUCKET_NAME to the stack WebBucketName output}"
: "${WEB_DISTRIBUTION_ID:?Set WEB_DISTRIBUTION_ID to the stack WebDistributionId output}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Building apps/web with VITE_API_BASE_URL=${VITE_API_BASE_URL} ..."
(cd "$REPO_ROOT/apps/web" && npx vite build)

echo "Syncing apps/web/dist to s3://${WEB_BUCKET_NAME} ..."
aws s3 sync "$REPO_ROOT/apps/web/dist/" "s3://${WEB_BUCKET_NAME}/" --delete

echo "Invalidating CloudFront distribution ${WEB_DISTRIBUTION_ID} ..."
aws cloudfront create-invalidation --distribution-id "$WEB_DISTRIBUTION_ID" --paths '/*'

echo "Done."
