import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDashboardSummary } from '../lib/api.js';
import { MoneyAmount } from '../components/MoneyAmount.js';
import { EmptyState } from '../components/EmptyState.js';
import { SummaryCards } from '../components/dashboard/SummaryCards.js';
import { UpcomingPaymentsList } from '../components/dashboard/UpcomingPaymentsList.js';
import { CashFlowChart } from '../components/dashboard/CashFlowChart.js';

export function OverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboardSummary });

  if (isLoading || !data) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (data.isEmpty) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
        <EmptyState
          title="Let's get your finances set up"
          description="Add an income source, a recurring expense, or an account to see your cash-flow picture here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                to="/income"
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                Add income
              </Link>
              <Link
                to="/expenses"
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                Add expense
              </Link>
              <Link
                to="/accounts"
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                Add account
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">Overview</h1>

      <SummaryCards
        monthlyIncomeTotalMinorUnits={data.monthlyIncomeTotalMinorUnits}
        monthlyExpensesTotalMinorUnits={data.monthlyExpensesTotalMinorUnits}
        remainingMonthlyIncomeMinorUnits={data.remainingMonthlyIncomeMinorUnits}
      />

      <CashFlowChart
        monthlyIncomeTotalMinorUnits={data.monthlyIncomeTotalMinorUnits}
        monthlyExpensesTotalMinorUnits={data.monthlyExpensesTotalMinorUnits}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Upcoming payments</h2>
        <UpcomingPaymentsList payments={data.upcomingPayments} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Accounts</h2>
        {data.accounts.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            description="Add an account to see its balance here. Account balances are shown separately — they are not included in the calculations above."
          />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between p-4">
                <span className="font-medium text-slate-900">{account.name}</span>
                <MoneyAmount
                  amountMinorUnits={account.balanceMinorUnits}
                  currency={account.currency}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
