import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoTransactionRepository (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('transaction-repo-test');
  });

  it('upserts a transaction and finds it by id', async () => {
    const now = new Date().toISOString();
    await ctx.transactionRepository.upsert({
      id: 'txn-basic',
      tenantId: 'tenant-a',
      accountId: 'account-1',
      plaidAccountId: 'plaid-acct-1',
      amountMinorUnits: 1500,
      currency: 'GBP',
      description: 'Coffee shop',
      date: '2026-01-01',
      pending: true,
      createdAt: now,
      updatedAt: now,
    });

    expect(await ctx.transactionRepository.getById('tenant-a', 'txn-basic')).toMatchObject({
      description: 'Coffee shop',
      pending: true,
    });
  });

  it('a modify (even one that changes the date) updates the same row — no orphan (resolution #1)', async () => {
    const now = new Date().toISOString();
    await ctx.transactionRepository.upsert({
      id: 'txn-modify',
      tenantId: 'tenant-b',
      accountId: 'account-1',
      plaidAccountId: 'plaid-acct-1',
      amountMinorUnits: 1000,
      currency: 'GBP',
      description: 'Coffee shop (pending)',
      date: '2026-01-01',
      pending: true,
      createdAt: now,
      updatedAt: now,
    });

    // Simulate Plaid's "modify" with a changed date and pending status —
    // the exact scenario that would orphan a date-encoded key.
    await ctx.transactionRepository.upsert({
      id: 'txn-modify',
      tenantId: 'tenant-b',
      accountId: 'account-1',
      plaidAccountId: 'plaid-acct-1',
      amountMinorUnits: 1000,
      currency: 'GBP',
      description: 'Coffee shop',
      date: '2026-01-03',
      pending: false,
      createdAt: now,
      updatedAt: now,
    });

    const all = await ctx.transactionRepository.list('tenant-b');
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'txn-modify', date: '2026-01-03', pending: false });
  });

  it('removes a transaction by id', async () => {
    const now = new Date().toISOString();
    await ctx.transactionRepository.upsert({
      id: 'txn-remove',
      tenantId: 'tenant-c',
      accountId: 'account-1',
      plaidAccountId: 'plaid-acct-1',
      amountMinorUnits: 500,
      currency: 'GBP',
      description: 'To be removed',
      date: '2026-01-01',
      pending: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.transactionRepository.remove('tenant-c', 'txn-remove');
    expect(await ctx.transactionRepository.getById('tenant-c', 'txn-remove')).toBeNull();
  });

  it('filters by account, date range, pending, and search text', async () => {
    const now = new Date().toISOString();
    const base = {
      tenantId: 'tenant-d',
      plaidAccountId: 'plaid-acct-1',
      currency: 'GBP',
      createdAt: now,
      updatedAt: now,
    };
    await ctx.transactionRepository.upsert({ ...base, id: 'txn-f1', accountId: 'acct-1', amountMinorUnits: 100, description: 'Coffee', date: '2026-01-01', pending: false });
    await ctx.transactionRepository.upsert({ ...base, id: 'txn-f2', accountId: 'acct-2', amountMinorUnits: 200, description: 'Rent', date: '2026-01-15', pending: false });
    await ctx.transactionRepository.upsert({ ...base, id: 'txn-f3', accountId: 'acct-1', amountMinorUnits: 300, description: 'Groceries', date: '2026-01-20', pending: true });

    expect(await ctx.transactionRepository.list('tenant-d', { accountId: 'acct-1' })).toHaveLength(2);
    expect(await ctx.transactionRepository.list('tenant-d', { pending: true })).toHaveLength(1);
    expect(
      await ctx.transactionRepository.list('tenant-d', { startDate: '2026-01-10', endDate: '2026-01-16' }),
    ).toHaveLength(1);
    expect(await ctx.transactionRepository.list('tenant-d', { search: 'coffee' })).toHaveLength(1);
  });

  it('updates notes, leaving everything else unchanged', async () => {
    const now = new Date().toISOString();
    await ctx.transactionRepository.upsert({
      id: 'txn-notes',
      tenantId: 'tenant-e',
      accountId: 'account-1',
      plaidAccountId: 'plaid-acct-1',
      amountMinorUnits: 100,
      currency: 'GBP',
      description: 'Lunch',
      date: '2026-01-01',
      pending: false,
      createdAt: now,
      updatedAt: now,
    });

    const updated = await ctx.transactionRepository.updateNotes('tenant-e', 'txn-notes', 'Client meeting', now);
    expect(updated.notes).toBe('Client meeting');
    expect(updated.description).toBe('Lunch');
  });

  it('removeAllForTenant only removes that tenant\'s transactions', async () => {
    const now = new Date().toISOString();
    await ctx.transactionRepository.upsert({
      id: 'txn-x',
      tenantId: 'tenant-x',
      accountId: 'account-1',
      plaidAccountId: 'plaid-acct-1',
      amountMinorUnits: 100,
      currency: 'GBP',
      description: 'X',
      date: '2026-01-01',
      pending: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.transactionRepository.upsert({
      id: 'txn-y',
      tenantId: 'tenant-y',
      accountId: 'account-1',
      plaidAccountId: 'plaid-acct-1',
      amountMinorUnits: 100,
      currency: 'GBP',
      description: 'Y',
      date: '2026-01-01',
      pending: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.transactionRepository.removeAllForTenant('tenant-x');

    expect(await ctx.transactionRepository.list('tenant-x')).toHaveLength(0);
    expect(await ctx.transactionRepository.list('tenant-y')).toHaveLength(1);
  });
});
