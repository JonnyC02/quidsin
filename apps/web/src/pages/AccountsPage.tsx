import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAmountToMinorUnits } from '@quidsin/shared';
import { accounts } from '../lib/api.js';
import { MoneyAmount } from '../components/MoneyAmount.js';
import { EmptyState } from '../components/EmptyState.js';
import { AccountForm } from '../components/forms/AccountForm.js';

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({});
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: accounts.list });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['accounts'] });
  }

  const createMutation = useMutation({ mutationFn: accounts.create, onSuccess: invalidate });
  const updateBalanceMutation = useMutation({
    mutationFn: ({ id, balanceMinorUnits }: { id: string; balanceMinorUnits: number }) =>
      accounts.updateBalance(id, balanceMinorUnits),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({ mutationFn: accounts.remove, onSuccess: invalidate });

  const items = accountsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">Accounts</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Add new</h2>
        <AccountForm onSubmit={(input) => createMutation.mutateAsync(input)} />
      </section>

      {accountsQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add your current account, savings, or anything else you want to track the balance of. All accounts are manual until bank connections arrive in a later release."
        />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {items.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-slate-900">{account.name}</p>
                <p className="text-sm text-slate-500">
                  {account.institutionName ? `${account.institutionName} · ` : ''}
                  <MoneyAmount
                    amountMinorUnits={account.balanceMinorUnits}
                    currency={account.currency}
                  />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="New balance"
                  value={balanceDrafts[account.id] ?? ''}
                  onChange={(e) =>
                    setBalanceDrafts({ ...balanceDrafts, [account.id]: e.target.value })
                  }
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const draft = balanceDrafts[account.id];
                    const balanceMinorUnits = draft ? parseAmountToMinorUnits(draft) : null;
                    if (balanceMinorUnits === null) {
                      return;
                    }
                    updateBalanceMutation.mutate({ id: account.id, balanceMinorUnits });
                    setBalanceDrafts({ ...balanceDrafts, [account.id]: '' });
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Update balance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete "${account.name}"? This cannot be undone.`)) {
                      removeMutation.mutate(account.id);
                    }
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
