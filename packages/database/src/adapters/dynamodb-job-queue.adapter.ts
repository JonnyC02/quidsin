import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PutCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { JobQueue, SyncJob } from '@quidsin/core';
import { keys } from '../table/schema.js';

const COMPLETED_JOB_TTL_SECONDS = 60 * 60; // 1 hour — expire quickly, nothing to debug
const FAILED_JOB_TTL_SECONDS = 24 * 60 * 60; // 24 hours — keep around long enough to investigate

type JobStatus = 'pending' | 'in_progress' | 'done' | 'failed';

interface JobItem {
  pk: string;
  sk: string;
  tenantId: string;
  plaidItemId: string;
  status: JobStatus;
  attempts: number;
  visibleAt: number;
  createdAt: string;
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * The entire sync queue lives in one DynamoDB partition (pk='QUEUE#SYNC')
 * — a bounded Query across it is fine at this app's scale (at most a
 * handful of concurrent bank connections per tenant). Concurrency safety
 * comes from the conditional writes below, not from key design.
 */
export class DynamoDbJobQueue implements JobQueue {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async enqueueSync(job: { tenantId: string; plaidItemId: string }): Promise<void> {
    const now = new Date().toISOString();

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            ...keys.job(job.plaidItemId),
            entityType: 'SyncJob',
            tenantId: job.tenantId,
            plaidItemId: job.plaidItemId,
            status: 'pending' satisfies JobStatus,
            attempts: 0,
            visibleAt: 0,
            createdAt: now,
          },
          // Coalesces duplicate webhook deliveries for the same item: if
          // a job already exists and is still pending/in-progress, this
          // condition fails and we swallow it below — no second
          // overlapping sync gets queued. A job that's already done or
          // failed can be freely re-queued.
          ConditionExpression:
            'attribute_not_exists(pk) OR #status = :done OR #status = :failed',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':done': 'done' satisfies JobStatus,
            ':failed': 'failed' satisfies JobStatus,
          },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return; // intended coalesce, not a real error
      }
      throw error;
    }
  }

  async claimNext(workerId: string, leaseDurationMs: number): Promise<SyncJob | null> {
    const now = Date.now();

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'QUEUE#SYNC' },
      }),
    );

    const candidates = ((result.Items ?? []) as JobItem[])
      .filter(
        (item) =>
          item.status === 'pending' || (item.status === 'in_progress' && item.visibleAt < now),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const candidate of candidates) {
      const claimed = await this.tryClaim(candidate, workerId, leaseDurationMs);
      if (claimed) {
        return claimed;
      }
      // Someone else claimed it between our Query and this UpdateCommand
      // — try the next candidate instead of giving up immediately.
    }

    return null;
  }

  private async tryClaim(
    candidate: JobItem,
    workerId: string,
    leaseDurationMs: number,
  ): Promise<SyncJob | null> {
    try {
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: keys.job(candidate.plaidItemId),
          UpdateExpression:
            'SET #status = :inProgress, visibleAt = :visibleAt, attempts = attempts + :one, claimedBy = :workerId',
          ConditionExpression:
            '#status = :pending OR (#status = :inProgress AND visibleAt < :now)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':pending': 'pending' satisfies JobStatus,
            ':inProgress': 'in_progress' satisfies JobStatus,
            ':visibleAt': Date.now() + leaseDurationMs,
            ':one': 1,
            ':workerId': workerId,
            ':now': Date.now(),
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      const attributes = result.Attributes as JobItem;
      return { tenantId: attributes.tenantId, plaidItemId: attributes.plaidItemId, attempts: attributes.attempts };
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return null; // lost the race for this one
      }
      throw error;
    }
  }

  async complete(plaidItemId: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.job(plaidItemId),
        UpdateExpression: 'SET #status = :status, #ttl = :ttl',
        ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':status': 'done' satisfies JobStatus,
          ':ttl': nowEpochSeconds() + COMPLETED_JOB_TTL_SECONDS,
        },
      }),
    );
  }

  async fail(plaidItemId: string, error: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.job(plaidItemId),
        UpdateExpression: 'SET #status = :status, lastError = :error, #ttl = :ttl',
        ExpressionAttributeNames: { '#status': 'status', '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':status': 'failed' satisfies JobStatus,
          ':error': error,
          ':ttl': nowEpochSeconds() + FAILED_JOB_TTL_SECONDS,
        },
      }),
    );
  }
}
