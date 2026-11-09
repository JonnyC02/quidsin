import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, TransactionService } from '../index.js';
import { FixedClock, InMemoryAccountRepository, InMemoryTransactionRepository } from './fakes.js';

const ctxA = { userId: 'user-a', tenantId: 'tenant-a', role: 'owner' as const };
const ctxB = { userId: 'user-b', tenantId: 'tenant-b', role: 'owner' as const };

async function buildService() {
  const repository = new InMemoryTransactionRepository();
  const accountRepository = new InMemoryAccountRepository();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
  const service = new TransactionService({ repository, accountRepository, clock });

  // Transactions inherit visibility from their owning account — seed the
  // accounts both test tenants' transactions point at.
  await accountRepository.create({
    id: 'account-1',
    tenantId: ctxA.tenantId,
    ownerId: ctxA.userId,
    name: 'Checking',
    type: 'current',
    currency: 'GBP',
    balanceMinorUnits: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  await accountRepository.create({
    id: 'account-b-1',
    tenantId: ctxB.tenantId,
    ownerId: ctxB.userId,
    name: 'Checking',
    type: 'current',
    currency: 'GBP',
    balanceMinorUnits: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  return { service, repository, accountRepository, clock };
}

async function seedTransaction(repository: InMemoryTransactionRepository, overrides: Partial<Parameters<InMemoryTransactionRepository['upsert']>[0]> = {}) {
  return repository.upsert({
    id: 'txn-1',
    tenantId: ctxA.tenantId,
    accountId: 'account-1',
    plaidAccountId: 'plaid-acct-1',
    amountMinorUnits: 1500,
    currency: 'GBP',
    description: 'Coffee shop',
    date: '2026-01-01',
    pending: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

describe('TransactionService', () => {
  let ctx: Awaited<ReturnType<typeof buildService>>;

  beforeEach(async () => {
    ctx = await buildService();
  });

  it('lists transactions scoped to the caller tenant', async () => {
    await seedTransaction(ctx.repository);
    await seedTransaction(ctx.repository, {
      id: 'txn-2',
      tenantId: ctxB.tenantId,
      accountId: 'account-b-1',
    });

    expect(await ctx.service.list(ctxA)).toHaveLength(1);
    expect(await ctx.service.list(ctxB)).toHaveLength(1);
  });

  it('applies filters when listing', async () => {
    await seedTransaction(ctx.repository, { id: 'txn-coffee', description: 'Coffee shop' });
    await seedTransaction(ctx.repository, { id: 'txn-rent', description: 'Rent payment', amountMinorUnits: 100_000 });

    const results = await ctx.service.list(ctxA, { search: 'coffee' });
    expect(results.map((t) => t.id)).toEqual(['txn-coffee']);
  });

  it('updates notes on an owned transaction', async () => {
    await seedTransaction(ctx.repository);

    const updated = await ctx.service.updateNotes(ctxA, 'txn-1', 'Client lunch');
    expect(updated.notes).toBe('Client lunch');
  });

  it('throws NotFoundError updating notes on an unknown or cross-tenant transaction', async () => {
    await seedTransaction(ctx.repository);

    await expect(ctx.service.updateNotes(ctxA, 'missing', 'x')).rejects.toThrow(NotFoundError);
    await expect(ctx.service.updateNotes(ctxB, 'txn-1', 'x')).rejects.toThrow(NotFoundError);
  });
});
