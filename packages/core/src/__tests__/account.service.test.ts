import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService, NotFoundError } from '../index.js';
import { FixedClock, InMemoryAccountRepository, SequentialIdGenerator } from './fakes.js';

const ctxA = { userId: 'user-a', tenantId: 'tenant-a' };
const ctxB = { userId: 'user-b', tenantId: 'tenant-b' };

function buildAccountService() {
  const repository = new InMemoryAccountRepository();
  const service = new AccountService({
    repository,
    clock: new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
    idGenerator: new SequentialIdGenerator(),
  });
  return { service, repository };
}

describe('AccountService', () => {
  let ctx: ReturnType<typeof buildAccountService>;

  beforeEach(() => {
    ctx = buildAccountService();
  });

  it('creates a manual account scoped to the caller', async () => {
    const account = await ctx.service.create(ctxA, {
      name: 'Current account',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 100_000,
    });

    expect(account.isManual).toBe(true);
    expect(account.ownerId).toBe(ctxA.userId);
  });

  it('updates the balance independently of other metadata', async () => {
    const account = await ctx.service.create(ctxA, {
      name: 'Current account',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 100_000,
    });

    const updated = await ctx.service.updateBalance(ctxA, account.id, 250_000);
    expect(updated.balanceMinorUnits).toBe(250_000);
    expect(updated.name).toBe('Current account');
  });

  it('isolates accounts between tenants', async () => {
    const account = await ctx.service.create(ctxA, {
      name: 'Current account',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 100_000,
    });

    await expect(ctx.service.getById(ctxB, account.id)).rejects.toThrow(NotFoundError);
    await expect(ctx.service.updateBalance(ctxB, account.id, 1)).rejects.toThrow(NotFoundError);
  });
});
