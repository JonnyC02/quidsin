import { describe, expect, it } from 'vitest';
import { AccountService, DashboardService, IncomeService, ExpenseService } from '../index.js';
import {
  FixedClock,
  InMemoryAccountRepository,
  InMemoryRecurringMoneyItemRepository,
  SequentialIdGenerator,
} from './fakes.js';
import type { IncomeSource } from '../domain/entities/income.js';
import type { RecurringExpense } from '../domain/entities/expense.js';

const ctx = { userId: 'user-a', tenantId: 'tenant-a', role: 'owner' as const };

function buildDashboard() {
  const clock = new FixedClock(new Date('2026-03-01T00:00:00.000Z'));
  const idGenerator = new SequentialIdGenerator();
  const incomeRepository = new InMemoryRecurringMoneyItemRepository<IncomeSource>();
  const expenseRepository = new InMemoryRecurringMoneyItemRepository<RecurringExpense>();
  const accountRepository = new InMemoryAccountRepository();

  const incomeService = new IncomeService({ repository: incomeRepository, clock, idGenerator });
  const expenseService = new ExpenseService({ repository: expenseRepository, clock, idGenerator });
  const accountService = new AccountService({ repository: accountRepository, clock, idGenerator });
  const dashboardService = new DashboardService({
    incomeRepository,
    expenseRepository,
    accountRepository,
    clock,
  });

  return { incomeService, expenseService, accountService, dashboardService };
}

describe('DashboardService', () => {
  it('reports isEmpty for a brand-new tenant', async () => {
    const { dashboardService } = buildDashboard();
    const summary = await dashboardService.getSummary(ctx);

    expect(summary.isEmpty).toBe(true);
    expect(summary.monthlyIncomeTotalMinorUnits).toBe(0);
    expect(summary.monthlyExpensesTotalMinorUnits).toBe(0);
    expect(summary.remainingMonthlyIncomeMinorUnits).toBe(0);
  });

  it('computes totals, remaining income, and chronological upcoming payments', async () => {
    const { incomeService, expenseService, accountService, dashboardService } = buildDashboard();

    await incomeService.create(ctx, {
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: '2026-03-25',
    });
    const rent = await expenseService.create(ctx, {
      name: 'Rent',
      amountMinorUnits: 120_000,
      frequency: 'monthly',
      anchorDate: '2026-03-10',
    });
    // paused — must be excluded from totals and upcoming payments
    const gym = await expenseService.create(ctx, {
      name: 'Gym',
      amountMinorUnits: 3_000,
      frequency: 'monthly',
      anchorDate: '2026-03-05',
    });
    await expenseService.setActive(ctx, gym.id, false);

    await accountService.create(ctx, {
      name: 'Current account',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 50_000,
    });

    const summary = await dashboardService.getSummary(ctx);

    expect(summary.isEmpty).toBe(false);
    expect(summary.monthlyIncomeTotalMinorUnits).toBe(300_000);
    expect(summary.monthlyExpensesTotalMinorUnits).toBe(120_000);
    expect(summary.remainingMonthlyIncomeMinorUnits).toBe(180_000);
    expect(summary.accounts).toHaveLength(1);

    // Rent (03-10) comes before Salary (03-25); the paused gym membership
    // must not appear at all.
    expect(summary.upcomingPayments.map((p) => p.name)).toEqual(['Rent', 'Salary']);
    expect(summary.upcomingPayments[0]!.id).toBe(rent.id);
  });
});
