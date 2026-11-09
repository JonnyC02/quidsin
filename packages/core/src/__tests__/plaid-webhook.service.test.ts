import { beforeEach, describe, expect, it } from 'vitest';
import { PlaidWebhookService } from '../index.js';
import { FakeBankingProvider, InMemoryJobQueue, InMemoryPlaidItemRepository } from './fakes.js';

const tenantId = 'tenant-a';
const plaidItemId = 'item-1';

function buildService() {
  const bankingProvider = new FakeBankingProvider();
  const plaidItemRepository = new InMemoryPlaidItemRepository();
  const jobQueue = new InMemoryJobQueue();
  const service = new PlaidWebhookService({ bankingProvider, plaidItemRepository, jobQueue });
  return { service, bankingProvider, plaidItemRepository, jobQueue };
}

describe('PlaidWebhookService', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(async () => {
    ctx = buildService();
    await ctx.plaidItemRepository.create({
      id: plaidItemId,
      tenantId,
      ownerId: 'user-a',
      encryptedAccessToken: { ciphertext: 'x', iv: 'x', authTag: 'x' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('accepts a valid signature and rejects an invalid one', async () => {
    ctx.bankingProvider.setWebhookSignatureValid(true);
    expect(await ctx.service.verifySignature('body', 'jwt')).toBe(true);

    ctx.bankingProvider.setWebhookSignatureValid(false);
    expect(await ctx.service.verifySignature('body', 'jwt')).toBe(false);
  });

  it('enqueues a sync job for a TRANSACTIONS webhook, resolving tenantId from our own stored item', async () => {
    await ctx.service.handleWebhookPayload({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: plaidItemId,
    });

    const claimed = await ctx.jobQueue.claimNext('worker-1', 60_000);
    expect(claimed).toMatchObject({ tenantId, plaidItemId });
  });

  it('marks the item in error for an ITEM error webhook', async () => {
    await ctx.service.handleWebhookPayload({
      webhook_type: 'ITEM',
      webhook_code: 'ERROR',
      item_id: plaidItemId,
      error: { error_message: 'ITEM_LOGIN_REQUIRED' },
    });

    const item = await ctx.plaidItemRepository.getById(tenantId, plaidItemId);
    expect(item?.status).toBe('error');
    expect(item?.lastError).toBe('ITEM_LOGIN_REQUIRED');
  });

  it('is a no-op for an unknown item_id', async () => {
    await expect(
      ctx.service.handleWebhookPayload({
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'SYNC_UPDATES_AVAILABLE',
        item_id: 'unknown-item',
      }),
    ).resolves.toBeUndefined();

    expect(await ctx.jobQueue.claimNext('worker-1', 60_000)).toBeNull();
  });
});
