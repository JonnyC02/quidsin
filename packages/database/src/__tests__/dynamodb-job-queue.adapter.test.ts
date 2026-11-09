import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoDbJobQueue (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('job-queue-test');
  });

  it('enqueues and claims a job', async () => {
    await ctx.jobQueue.enqueueSync({ tenantId: 'tenant-a', plaidItemId: 'item-claim' });

    const claimed = await ctx.jobQueue.claimNext('worker-1', 60_000);
    expect(claimed).toMatchObject({ tenantId: 'tenant-a', plaidItemId: 'item-claim', attempts: 1 });
  });

  it('coalesces a duplicate enqueue for the same item while a job is still pending/in-progress', async () => {
    await ctx.jobQueue.enqueueSync({ tenantId: 'tenant-b', plaidItemId: 'item-coalesce' });
    // Duplicate webhook delivery — must not create a second overlapping job.
    await ctx.jobQueue.enqueueSync({ tenantId: 'tenant-b', plaidItemId: 'item-coalesce' });

    const first = await ctx.jobQueue.claimNext('worker-1', 60_000);
    expect(first).toMatchObject({ plaidItemId: 'item-coalesce' });

    // Nothing left to claim — the duplicate enqueue was a no-op.
    const second = await ctx.jobQueue.claimNext('worker-2', 60_000);
    expect(second === null || second.plaidItemId !== 'item-coalesce').toBe(true);
  });

  it('allows re-enqueueing after a job completes', async () => {
    await ctx.jobQueue.enqueueSync({ tenantId: 'tenant-c', plaidItemId: 'item-requeue' });
    await ctx.jobQueue.claimNext('worker-1', 60_000);
    await ctx.jobQueue.complete('item-requeue');

    await ctx.jobQueue.enqueueSync({ tenantId: 'tenant-c', plaidItemId: 'item-requeue' });
    const claimed = await ctx.jobQueue.claimNext('worker-1', 60_000);
    expect(claimed).toMatchObject({ plaidItemId: 'item-requeue' });
  });

  it('only one of two concurrent claimNext calls succeeds for the same job (resolution #3)', async () => {
    await ctx.jobQueue.enqueueSync({ tenantId: 'tenant-d', plaidItemId: 'item-concurrent' });

    const [resultA, resultB] = await Promise.all([
      ctx.jobQueue.claimNext('worker-a', 60_000),
      ctx.jobQueue.claimNext('worker-b', 60_000),
    ]);

    const successes = [resultA, resultB].filter((r) => r?.plaidItemId === 'item-concurrent');
    expect(successes).toHaveLength(1);
  });

  it('a claimed job becomes claimable again once its lease expires', async () => {
    await ctx.jobQueue.enqueueSync({ tenantId: 'tenant-e', plaidItemId: 'item-lease' });

    const first = await ctx.jobQueue.claimNext('worker-1', 1); // 1ms lease
    expect(first).toMatchObject({ plaidItemId: 'item-lease', attempts: 1 });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await ctx.jobQueue.claimNext('worker-2', 60_000);
    expect(second).toMatchObject({ plaidItemId: 'item-lease', attempts: 2 });
  });
});
