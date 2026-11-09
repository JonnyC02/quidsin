import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monthlyEquivalentMinorUnits, type RecurringMoneyItem, type Visibility } from '@quidsin/core';
import type { RecurringMoneyItemInput } from '../lib/api.js';
import { MoneyAmount } from './MoneyAmount.js';
import { EmptyState } from './EmptyState.js';
import { RecurringMoneyItemForm } from './forms/RecurringMoneyItemForm.js';
import { VisibilityControl } from './VisibilityControl.js';

export interface RecurringItemsApi<T extends RecurringMoneyItem> {
  list: () => Promise<T[]>;
  create: (input: RecurringMoneyItemInput) => Promise<T>;
  update: (id: string, input: Partial<RecurringMoneyItemInput>) => Promise<T>;
  setActive: (id: string, active: boolean) => Promise<T>;
  setVisibility: (id: string, visibility: Visibility, sharedWithUserIds?: string[]) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

export function RecurringItemsPage<T extends RecurringMoneyItem>({
  title,
  queryKey,
  api,
  emptyStateTitle,
  emptyStateDescription,
}: {
  title: string;
  queryKey: string;
  api: RecurringItemsApi<T>;
  emptyStateTitle: string;
  emptyStateDescription: string;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const itemsQuery = useQuery({ queryKey: [queryKey], queryFn: api.list });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: [queryKey] });
  }

  const createMutation = useMutation({ mutationFn: api.create, onSuccess: invalidate });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RecurringMoneyItemInput> }) =>
      api.update(id, input),
    onSuccess: () => {
      setEditingId(null);
      return invalidate();
    },
  });
  const setActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.setActive(id, active),
    onSuccess: invalidate,
  });
  const setVisibilityMutation = useMutation({
    mutationFn: ({
      id,
      visibility,
      sharedWithUserIds,
    }: {
      id: string;
      visibility: Visibility;
      sharedWithUserIds?: string[];
    }) => api.setVisibility(id, visibility, sharedWithUserIds),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({ mutationFn: api.remove, onSuccess: invalidate });

  const items = itemsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Add new</h2>
        <RecurringMoneyItemForm
          submitLabel="Add"
          onSubmit={(input) => createMutation.mutateAsync(input)}
        />
      </section>

      {itemsQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title={emptyStateTitle} description={emptyStateDescription} />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {items.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className="p-4">
                <RecurringMoneyItemForm
                  submitLabel="Save"
                  initialValues={{
                    name: item.name,
                    amount: (item.amountMinorUnits / 100).toFixed(2),
                    frequency: item.frequency,
                    anchorDate: item.anchorDate,
                    description: item.description ?? '',
                  }}
                  onSubmit={(input) => updateMutation.mutateAsync({ id: item.id, input })}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={item.id} className="flex items-center justify-between gap-4 p-4">
                <div className={item.active ? '' : 'opacity-50'}>
                  <p className="font-medium text-slate-900">
                    {item.name}
                    {!item.active && (
                      <span className="ml-2 text-xs font-normal text-slate-400">(paused)</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">
                    <MoneyAmount amountMinorUnits={item.amountMinorUnits} /> {item.frequency}{' '}
                    &middot; monthly equivalent{' '}
                    <MoneyAmount
                      amountMinorUnits={monthlyEquivalentMinorUnits(
                        item.amountMinorUnits,
                        item.frequency,
                      )}
                    />
                  </p>
                  {item.description && <p className="text-sm text-slate-400">{item.description}</p>}
                  <div className="mt-1">
                    <VisibilityControl
                      visibility={item.visibility}
                      sharedWithUserIds={item.sharedWithUserIds}
                      onChange={(visibility, sharedWithUserIds) =>
                        setVisibilityMutation.mutate({ id: item.id, visibility, sharedWithUserIds })
                      }
                    />
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(item.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMutation.mutate({ id: item.id, active: !item.active })}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    {item.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                        removeMutation.mutate(item.id);
                      }
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
