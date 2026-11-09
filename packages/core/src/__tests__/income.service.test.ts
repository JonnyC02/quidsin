import { beforeEach, describe, expect, it } from 'vitest';
import { ExpenseService, IncomeService, NotFoundError } from '../index.js';
import {
  FixedClock,
  InMemoryRecurringMoneyItemRepository,
  SequentialIdGenerator,
} from './fakes.js';
import type { IncomeSource } from '../domain/entities/income.js';
import type { RecurringExpense } from '../domain/entities/expense.js';

const ctxA = { userId: 'user-a', tenantId: 'tenant-a', role: 'owner' as const };
const ctxB = { userId: 'user-b', tenantId: 'tenant-b', role: 'owner' as const };
/** A second member sharing ctxA's tenant — for same-tenant visibility tests. */
const ctxMember = { userId: 'user-member', tenantId: 'tenant-a', role: 'member' as const };

function buildIncomeService() {
  const repository = new InMemoryRecurringMoneyItemRepository<IncomeSource>();
  const service = new IncomeService({
    repository,
    clock: new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
    idGenerator: new SequentialIdGenerator(),
  });
  return { service, repository };
}

describe('IncomeService', () => {
  let ctx: ReturnType<typeof buildIncomeService>;

  beforeEach(() => {
    ctx = buildIncomeService();
  });

  it('creates an income source scoped to the caller', async () => {
    const income = await ctx.service.create(ctxA, {
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: '2026-01-25',
    });

    expect(income.ownerId).toBe(ctxA.userId);
    expect(income.tenantId).toBe(ctxA.tenantId);
    expect(income.active).toBe(true);
  });

  it("lists only the caller tenant's income sources", async () => {
    await ctx.service.create(ctxA, {
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: '2026-01-25',
    });
    // directly seed a record for a different tenant via the repository
    await ctx.repository.create({
      id: 'other',
      tenantId: ctxB.tenantId,
      ownerId: ctxB.userId,
      name: 'Side gig',
      amountMinorUnits: 50_000,
      frequency: 'monthly',
      anchorDate: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const listA = await ctx.service.list(ctxA);
    expect(listA).toHaveLength(1);
    expect(listA[0]!.name).toBe('Salary');
  });

  it('returns NotFoundError for a record that does not exist, or belongs to someone else', async () => {
    const income = await ctx.service.create(ctxA, {
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: '2026-01-25',
    });

    await expect(ctx.service.getById(ctxA, 'missing')).rejects.toThrow(NotFoundError);
    // Different tenant can't read ctxA's income even by guessing the id.
    await expect(ctx.service.getById(ctxB, income.id)).rejects.toThrow(NotFoundError);
  });

  it('can deactivate and reactivate without deleting the record', async () => {
    const income = await ctx.service.create(ctxA, {
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: '2026-01-25',
    });

    const deactivated = await ctx.service.setActive(ctxA, income.id, false);
    expect(deactivated.active).toBe(false);

    const stillThere = await ctx.service.getById(ctxA, income.id);
    expect(stillThere.id).toBe(income.id);

    const reactivated = await ctx.service.setActive(ctxA, income.id, true);
    expect(reactivated.active).toBe(true);
  });

  it('removes a record entirely', async () => {
    const income = await ctx.service.create(ctxA, {
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: '2026-01-25',
    });

    await ctx.service.remove(ctxA, income.id);
    await expect(ctx.service.getById(ctxA, income.id)).rejects.toThrow(NotFoundError);
  });

  it('a private income source is invisible to another member of the same tenant until shared with the tenant', async () => {
    const income = await ctx.service.create(ctxA, {
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: '2026-01-25',
    });

    await expect(ctx.service.getById(ctxMember, income.id)).rejects.toThrow(NotFoundError);
    expect(await ctx.service.list(ctxMember)).toHaveLength(0);

    await ctx.service.setVisibility(ctxA, income.id, 'tenant');
    expect((await ctx.service.getById(ctxMember, income.id)).id).toBe(income.id);
    expect(await ctx.service.list(ctxMember)).toHaveLength(1);
  });
});

describe('ExpenseService (shares RecurringMoneyItemService behavior)', () => {
  it('behaves the same way as IncomeService for its own entity type', async () => {
    const repository = new InMemoryRecurringMoneyItemRepository<RecurringExpense>();
    const service = new ExpenseService({
      repository,
      clock: new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
      idGenerator: new SequentialIdGenerator(),
    });

    const expense = await service.create(ctxA, {
      name: 'Rent',
      amountMinorUnits: 120_000,
      frequency: 'monthly',
      anchorDate: '2026-01-01',
    });

    expect(expense.ownerId).toBe(ctxA.userId);
    expect(await service.list(ctxA)).toHaveLength(1);
  });
});
