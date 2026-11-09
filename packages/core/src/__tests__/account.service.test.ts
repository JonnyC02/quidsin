import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService, NotFoundError } from '../index.js';
import { FixedClock, InMemoryAccountRepository, SequentialIdGenerator } from './fakes.js';

const ctxA = { userId: 'user-a', tenantId: 'tenant-a', role: 'owner' as const };
const ctxB = { userId: 'user-b', tenantId: 'tenant-b', role: 'owner' as const };
/** A second member sharing ctxA's tenant — for same-tenant visibility tests. */
const ctxMember = { userId: 'user-member', tenantId: 'tenant-a', role: 'member' as const };

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

  it('a private account is invisible to another member of the same tenant', async () => {
    const account = await ctx.service.create(ctxA, {
      name: 'Private savings',
      type: 'savings',
      currency: 'GBP',
      balanceMinorUnits: 5_000,
    });

    await expect(ctx.service.getById(ctxMember, account.id)).rejects.toThrow(NotFoundError);
    expect(await ctx.service.list(ctxMember)).toHaveLength(0);
    // The owner still sees it, naturally.
    expect(await ctx.service.list(ctxA)).toHaveLength(1);
  });

  it('setting visibility to "tenant" makes a record visible to other members', async () => {
    const account = await ctx.service.create(ctxA, {
      name: 'Household account',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 0,
    });

    await ctx.service.setVisibility(ctxA, account.id, 'tenant');

    const seen = await ctx.service.getById(ctxMember, account.id);
    expect(seen.id).toBe(account.id);
  });

  it('"shared" visibility is limited to the explicit member list', async () => {
    const account = await ctx.service.create(ctxA, {
      name: 'Joint savings',
      type: 'savings',
      currency: 'GBP',
      balanceMinorUnits: 0,
    });
    const otherMember = { userId: 'user-other', tenantId: 'tenant-a', role: 'member' as const };

    await ctx.service.setVisibility(ctxA, account.id, 'shared', [ctxMember.userId]);

    expect((await ctx.service.getById(ctxMember, account.id)).id).toBe(account.id);
    await expect(ctx.service.getById(otherMember, account.id)).rejects.toThrow(NotFoundError);
  });

  it('not even another member can change someone else\'s account visibility', async () => {
    const account = await ctx.service.create(ctxA, {
      name: 'Current account',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 0,
    });

    await expect(ctx.service.setVisibility(ctxMember, account.id, 'tenant')).rejects.toThrow(
      NotFoundError,
    );
  });
});
