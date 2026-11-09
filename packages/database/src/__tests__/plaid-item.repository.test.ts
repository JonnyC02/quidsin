import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoPlaidItemRepository (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('plaid-item-repo-test');
  });

  it('creates an item and finds it by (tenantId, id)', async () => {
    const now = new Date().toISOString();
    const item = await ctx.plaidItemRepository.create({
      id: 'item-create',
      tenantId: 'tenant-a',
      ownerId: 'user-a',
      institutionName: 'Fake Bank',
      encryptedAccessToken: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      createdAt: now,
      updatedAt: now,
    });

    expect(item.status).toBe('active');
    expect(await ctx.plaidItemRepository.getById('tenant-a', 'item-create')).toMatchObject({
      institutionName: 'Fake Bank',
    });
  });

  it('finds an item by Plaid item id via GSI1, with no tenantId required', async () => {
    const now = new Date().toISOString();
    await ctx.plaidItemRepository.create({
      id: 'item-gsi1',
      tenantId: 'tenant-b',
      ownerId: 'user-b',
      encryptedAccessToken: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      createdAt: now,
      updatedAt: now,
    });

    const found = await ctx.plaidItemRepository.findByPlaidItemId('item-gsi1');
    expect(found).toMatchObject({ id: 'item-gsi1', tenantId: 'tenant-b' });
    expect(await ctx.plaidItemRepository.findByPlaidItemId('unknown-item')).toBeNull();
  });

  it('updates the cursor and lastSyncedAt', async () => {
    const now = new Date().toISOString();
    await ctx.plaidItemRepository.create({
      id: 'item-cursor',
      tenantId: 'tenant-c',
      ownerId: 'user-c',
      encryptedAccessToken: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.plaidItemRepository.updateCursor('tenant-c', 'item-cursor', 'cursor-xyz', now);

    const item = await ctx.plaidItemRepository.getById('tenant-c', 'item-cursor');
    expect(item?.cursor).toBe('cursor-xyz');
  });

  it('marks an item errored and disconnected', async () => {
    const now = new Date().toISOString();
    await ctx.plaidItemRepository.create({
      id: 'item-status',
      tenantId: 'tenant-d',
      ownerId: 'user-d',
      encryptedAccessToken: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.plaidItemRepository.markError('tenant-d', 'item-status', 'ITEM_LOGIN_REQUIRED');
    expect(await ctx.plaidItemRepository.getById('tenant-d', 'item-status')).toMatchObject({
      status: 'error',
      lastError: 'ITEM_LOGIN_REQUIRED',
    });

    await ctx.plaidItemRepository.markDisconnected('tenant-d', 'item-status');
    expect(await ctx.plaidItemRepository.getById('tenant-d', 'item-status')).toMatchObject({
      status: 'disconnected',
    });
  });

  it('lists items for a tenant and removes them all', async () => {
    const now = new Date().toISOString();
    await ctx.plaidItemRepository.create({
      id: 'item-list-1',
      tenantId: 'tenant-e',
      ownerId: 'user-e',
      encryptedAccessToken: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.plaidItemRepository.create({
      id: 'item-list-2',
      tenantId: 'tenant-e',
      ownerId: 'user-e',
      encryptedAccessToken: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      createdAt: now,
      updatedAt: now,
    });

    expect(await ctx.plaidItemRepository.list('tenant-e')).toHaveLength(2);

    await ctx.plaidItemRepository.removeAllForTenant('tenant-e');
    expect(await ctx.plaidItemRepository.list('tenant-e')).toHaveLength(0);
  });
});
