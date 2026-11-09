import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accounts, transactions, type TransactionFilter } from '../lib/api.js';
import { MoneyAmount } from '../components/MoneyAmount.js';
import { EmptyState } from '../components/EmptyState.js';

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: accounts.list });
  const transactionsQuery = useQuery({
    queryKey: ['transactions', filter],
    queryFn: () => transactions.list(filter),
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => transactions.updateNotes(id, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const accountItems = accountsQuery.data ?? [];
  const items = transactionsQuery.data ?? [];

  function updateFilter(patch: Partial<TransactionFilter>) {
    setFilter({ ...filter, ...patch });
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">Transactions</h1>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Account
          <select
            value={filter.accountId ?? ''}
            onChange={(e) => updateFilter({ accountId: e.target.value || undefined })}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All accounts</option>
            {accountItems.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Search
          <input
            type="text"
            placeholder="Merchant or description"
            value={filter.search ?? ''}
            onChange={(e) => updateFilter({ search: e.target.value || undefined })}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          From
          <input
            type="date"
            value={filter.startDate ?? ''}
            onChange={(e) => updateFilter({ startDate: e.target.value || undefined })}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          To
          <input
            type="date"
            value={filter.endDate ?? ''}
            onChange={(e) => updateFilter({ endDate: e.target.value || undefined })}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={filter.pending ?? false}
            onChange={(e) => updateFilter({ pending: e.target.checked ? true : undefined })}
          />
          Pending only
        </label>

        {(filter.accountId ?? filter.search ?? filter.startDate ?? filter.endDate ?? filter.pending) && (
          <button
            type="button"
            onClick={() => setFilter({})}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Clear filters
          </button>
        )}
      </section>

      {transactionsQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description="Transactions appear here once a connected bank account has synced. Connect a bank, or use 'Sync now', from the Accounts page."
        />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {items.map((transaction) => (
            <li key={transaction.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {transaction.merchantName ?? transaction.description}
                  {transaction.pending && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Pending
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500">{transaction.date}</p>
                <input
                  type="text"
                  placeholder="Add a note"
                  value={noteDrafts[transaction.id] ?? transaction.notes ?? ''}
                  onChange={(e) => setNoteDrafts({ ...noteDrafts, [transaction.id]: e.target.value })}
                  onBlur={(e) => {
                    if (e.target.value !== (transaction.notes ?? '')) {
                      updateNotesMutation.mutate({ id: transaction.id, notes: e.target.value });
                    }
                  }}
                  className="mt-1 w-full max-w-xs rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
                />
              </div>
              <MoneyAmount
                amountMinorUnits={-transaction.amountMinorUnits}
                currency={transaction.currency}
                className="shrink-0 font-medium text-slate-900"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
