import type { UpcomingPayment } from '@quidsin/core';
import { MoneyAmount } from '../MoneyAmount.js';
import { EmptyState } from '../EmptyState.js';

export function UpcomingPaymentsList({ payments }: { payments: UpcomingPayment[] }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        title="No upcoming payments"
        description="Active income sources and recurring expenses will show up here, ordered by date."
      />
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {payments.map((payment) => (
        <li
          key={`${payment.type}-${payment.id}`}
          className="flex items-center justify-between gap-4 p-4"
        >
          <div>
            <p className="font-medium text-slate-900">{payment.name}</p>
            <p className="text-sm text-slate-500">{payment.date}</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                payment.type === 'income'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {payment.type === 'income' ? 'Income' : 'Expense'}
            </span>
            <MoneyAmount
              amountMinorUnits={payment.amountMinorUnits}
              className="font-medium text-slate-900"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
