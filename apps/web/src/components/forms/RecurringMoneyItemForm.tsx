import { useState, type FormEvent } from 'react';
import { FREQUENCIES, type Frequency } from '@quidsin/core';
import { parseAmountToMinorUnits } from '@quidsin/shared';
import type { RecurringMoneyItemInput } from '../../lib/api.js';

const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

export interface RecurringMoneyItemFormValues {
  name: string;
  amount: string;
  frequency: Frequency;
  anchorDate: string;
  description: string;
}

const EMPTY_VALUES: RecurringMoneyItemFormValues = {
  name: '',
  amount: '',
  frequency: 'monthly',
  anchorDate: new Date().toISOString().slice(0, 10),
  description: '',
};

export function RecurringMoneyItemForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValues?: RecurringMoneyItemFormValues;
  submitLabel: string;
  onSubmit: (input: RecurringMoneyItemInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<RecurringMoneyItemFormValues>(initialValues ?? EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const amountMinorUnits = parseAmountToMinorUnits(values.amount);
    if (amountMinorUnits === null || amountMinorUnits <= 0) {
      setError('Enter a valid amount greater than zero (e.g. 123.45).');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: values.name,
        amountMinorUnits,
        frequency: values.frequency,
        anchorDate: values.anchorDate,
        description: values.description || undefined,
      });
      setValues(EMPTY_VALUES);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-slate-700">Name</label>
        <input
          type="text"
          required
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Amount</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          required
          value={values.amount}
          onChange={(e) => setValues({ ...values, amount: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Frequency</label>
        <select
          value={values.frequency}
          onChange={(e) => setValues({ ...values, frequency: e.target.value as Frequency })}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          {FREQUENCIES.map((frequency) => (
            <option key={frequency} value={frequency}>
              {FREQUENCY_LABELS[frequency]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Payment date</label>
        <input
          type="date"
          required
          value={values.anchorDate}
          onChange={(e) => setValues({ ...values, anchorDate: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Description (optional)</label>
        <input
          type="text"
          value={values.description}
          onChange={(e) => setValues({ ...values, description: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
