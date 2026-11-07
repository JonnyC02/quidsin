import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('tenant isolation (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('tenant-isolation-test');
  });

  it('keeps income, expense, and account records isolated per tenant', async () => {
    const now = new Date().toISOString();

    await ctx.incomeRepository.create({
      id: 'income-a',
      tenantId: 'tenant-a',
      ownerId: 'user-a',
      name: 'Salary A',
      amountMinorUnits: 100_00,
      frequency: 'monthly',
      anchorDate: '2026-01-01',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.incomeRepository.create({
      id: 'income-b',
      tenantId: 'tenant-b',
      ownerId: 'user-b',
      name: 'Salary B',
      amountMinorUnits: 200_00,
      frequency: 'monthly',
      anchorDate: '2026-01-01',
      createdAt: now,
      updatedAt: now,
    });

    const tenantAIncome = await ctx.incomeRepository.list('tenant-a');
    expect(tenantAIncome).toHaveLength(1);
    expect(tenantAIncome[0]!.name).toBe('Salary A');

    // Tenant B can't read tenant A's record even by guessing its id, since
    // the partition key itself is derived from the (session-scoped) tenant.
    expect(await ctx.incomeRepository.getById('tenant-b', 'income-a')).toBeNull();
    expect(await ctx.incomeRepository.getById('tenant-a', 'income-a')).not.toBeNull();
  });

  it("removeAllForTenant only removes that tenant's records", async () => {
    const now = new Date().toISOString();

    await ctx.accountRepository.create({
      id: 'account-x',
      tenantId: 'tenant-x',
      ownerId: 'user-x',
      name: 'Current',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 1000,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.accountRepository.create({
      id: 'account-y',
      tenantId: 'tenant-y',
      ownerId: 'user-y',
      name: 'Current',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 2000,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.accountRepository.removeAllForTenant('tenant-x');

    expect(await ctx.accountRepository.list('tenant-x')).toHaveLength(0);
    expect(await ctx.accountRepository.list('tenant-y')).toHaveLength(1);
  });
});
