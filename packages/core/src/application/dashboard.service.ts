import type { IncomeRepository } from '../ports/income-repository.js';
import type { ExpenseRepository } from '../ports/expense-repository.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { Account } from '../domain/entities/account.js';
import type { Clock } from '../ports/clock.js';
import {
  sumMonthlyEquivalents,
  remainingMonthlyIncome,
} from '../domain/calculations/dashboard-totals.js';
import { nextOccurrence, toIsoDateString } from '../domain/calculations/next-occurrence.js';
import { canView } from '../domain/visibility-rules.js';
import type { AuthContext } from './auth-context.js';

export interface DashboardServiceDeps {
  incomeRepository: IncomeRepository;
  expenseRepository: ExpenseRepository;
  accountRepository: AccountRepository;
  clock: Clock;
}

export interface UpcomingPayment {
  id: string;
  name: string;
  amountMinorUnits: number;
  type: 'income' | 'expense';
  date: string;
}

export interface DashboardSummary {
  monthlyIncomeTotalMinorUnits: number;
  monthlyExpensesTotalMinorUnits: number;
  remainingMonthlyIncomeMinorUnits: number;
  accounts: Account[];
  upcomingPayments: UpcomingPayment[];
  isEmpty: boolean;
}

const MAX_UPCOMING_PAYMENTS = 10;

export class DashboardService {
  constructor(private readonly deps: DashboardServiceDeps) {}

  async getSummary(ctx: AuthContext): Promise<DashboardSummary> {
    const [allIncomes, allExpenses, allAccounts] = await Promise.all([
      this.deps.incomeRepository.list(ctx.tenantId),
      this.deps.expenseRepository.list(ctx.tenantId),
      this.deps.accountRepository.list(ctx.tenantId),
    ]);

    // Private records are excluded entirely from a shared dashboard's
    // totals, not just hidden-but-still-counted — the conservative,
    // privacy-respecting default.
    const incomes = allIncomes.filter((item) => canView(item, ctx));
    const expenses = allExpenses.filter((item) => canView(item, ctx));
    const accounts = allAccounts.filter((account) => canView(account, ctx));

    const activeIncomes = incomes.filter((item) => item.active);
    const activeExpenses = expenses.filter((item) => item.active);
    const today = this.deps.clock.now();

    const monthlyIncomeTotalMinorUnits = sumMonthlyEquivalents(activeIncomes);
    const monthlyExpensesTotalMinorUnits = sumMonthlyEquivalents(activeExpenses);

    const upcomingPayments: UpcomingPayment[] = [
      ...activeIncomes.map((income) => ({
        id: income.id,
        name: income.name,
        amountMinorUnits: income.amountMinorUnits,
        type: 'income' as const,
        date: toIsoDateString(nextOccurrence(income.frequency, income.anchorDate, today)),
      })),
      ...activeExpenses.map((expense) => ({
        id: expense.id,
        name: expense.name,
        amountMinorUnits: expense.amountMinorUnits,
        type: 'expense' as const,
        date: toIsoDateString(nextOccurrence(expense.frequency, expense.anchorDate, today)),
      })),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, MAX_UPCOMING_PAYMENTS);

    return {
      monthlyIncomeTotalMinorUnits,
      monthlyExpensesTotalMinorUnits,
      remainingMonthlyIncomeMinorUnits: remainingMonthlyIncome(
        monthlyIncomeTotalMinorUnits,
        monthlyExpensesTotalMinorUnits,
      ),
      accounts,
      upcomingPayments,
      isEmpty: incomes.length === 0 && expenses.length === 0 && accounts.length === 0,
    };
  }
}
