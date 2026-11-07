import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMinorUnits } from '@quidsin/shared';

/**
 * A snapshot comparison of this month's income vs. expenses — not a time
 * series. Phase 2 has no transaction history yet, so there's no real
 * trend data to plot; this avoids implying data that doesn't exist.
 */
export function CashFlowChart({
  monthlyIncomeTotalMinorUnits,
  monthlyExpensesTotalMinorUnits,
}: {
  monthlyIncomeTotalMinorUnits: number;
  monthlyExpensesTotalMinorUnits: number;
}) {
  const data = [
    { name: 'Income', amount: monthlyIncomeTotalMinorUnits / 100, fill: '#0f766e' },
    { name: 'Expenses', amount: monthlyExpensesTotalMinorUnits / 100, fill: '#dc2626' },
  ];

  return (
    <div className="h-64 rounded-lg border border-slate-200 bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={48} />
          <Tooltip
            formatter={(value: number) => formatMinorUnits(Math.round(value * 100), 'GBP')}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
