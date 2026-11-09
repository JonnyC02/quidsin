import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { Context } from 'aws-lambda';
import { loadConfigFromSsm } from '@quidsin/config';
import { buildWorker } from './build-worker.js';
import { requireEnv } from './infra/require-env.js';

/** Leaves this much headroom before the Lambda's own timeout to still call fail()/complete() cleanly. */
const SAFETY_MARGIN_MS = 5_000;

/**
 * Invoked on a schedule (see deploy/aws/template.yaml) rather than running
 * an infinite loop — each invocation drains the queue (claims and
 * processes jobs) until it's empty or time runs out, then returns.
 * Overlapping invocations are harmless: DynamoDbJobQueue's conditional
 * claim already makes concurrent claims safe (built for exactly this in
 * Phase 3, verified by a live-DynamoDB test).
 */
export const handler = async (_event: unknown, context: Context): Promise<void> => {
  const config = await loadConfigFromSsm({
    PLAID_CLIENT_ID: requireEnv('PLAID_CLIENT_ID_PARAM'),
    PLAID_SECRET: requireEnv('PLAID_SECRET_PARAM'),
    ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY_PARAM'),
  });

  const dynamoClient = new DynamoDBClient({ region: config.DYNAMODB_REGION });
  const { jobQueue, transactionSyncService } = buildWorker(config, { dynamoClient });
  const workerId = `lambda-${context.awsRequestId}`;

  while (context.getRemainingTimeInMillis() > SAFETY_MARGIN_MS) {
    const job = await jobQueue.claimNext(workerId, config.QUEUE_LEASE_DURATION_MS);

    if (!job) {
      break; // queue drained
    }

    try {
      await transactionSyncService.processItem(job);
      await jobQueue.complete(job.plaidItemId);
    } catch (error) {
      console.error(
        `[worker] sync failed for Plaid item ${job.plaidItemId}:`,
        error instanceof Error ? error.message : error,
      );
      await jobQueue.fail(job.plaidItemId, error instanceof Error ? error.message : String(error));
    }
  }
};
