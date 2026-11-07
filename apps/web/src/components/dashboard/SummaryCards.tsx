import { MoneyAmount } from '../MoneyAmount.js';

export function SummaryCards({
  monthlyIncomeTotalMinorUnits,
  monthlyExpensesTotalMinorUnits,
  remainingMonthlyIncomeMinorUnits,
}: {
  monthlyIncomeTotalMinorUnits: number;
  monthlyExpensesTotalMinorUnits: number;
  remainingMonthlyIncomeMinorUnits: number;
}) {
  const isNegative = remainingMonthlyIncomeMinorUnits < 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-500">Monthly income</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">
          <MoneyAmount amountMinorUnits={monthlyIncomeTotalMinorUnits} />
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-500">Monthly recurring expenses</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">
          <MoneyAmount amountMinorUnits={monthlyExpensesTotalMinorUnits} />
        </p>
      </div>
      <div
        className={`rounded-lg border p-5 ${isNegative ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
      >
        <p className="text-sm text-slate-500">Remaining monthly income</p>
        <p
          className={`mt-1 text-2xl font-semibold ${isNegative ? 'text-red-700' : 'text-slate-900'}`}
        >
          <MoneyAmount amountMinorUnits={remainingMonthlyIncomeMinorUnits} />
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Income minus expenses — not your actual bank balance.
        </p>
      </div>
    </div>
  );
}
