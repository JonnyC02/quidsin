import { useState, type FormEvent } from 'react';
import type { AccountType } from '@quidsin/core';
import { parseAmountToMinorUnits } from '@quidsin/shared';
import type { AccountInput } from '../../lib/api.js';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  current: 'Current account',
  savings: 'Savings account',
  isa_cash: 'Cash ISA',
  isa_stocks_and_shares: 'Stocks and shares ISA',
  credit_card: 'Credit card',
  other: 'Other',
};

export function AccountForm({ onSubmit }: { onSubmit: (input: AccountInput) => Promise<unknown> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('current');
  const [institutionName, setInstitutionName] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const balanceMinorUnits = parseAmountToMinorUnits(balance);
    if (balanceMinorUnits === null) {
      setError(
        'Enter a valid balance (e.g. 1234.56). Use a negative number for an overdrawn/credit balance.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        type,
        institutionName: institutionName || undefined,
        currency,
        balanceMinorUnits,
      });
      setName('');
      setInstitutionName('');
      setBalance('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-sm font-medium text-slate-700">Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Institution (optional)</label>
        <input
          type="text"
          value={institutionName}
          onChange={(e) => setInstitutionName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Currency</label>
        <input
          type="text"
          required
          maxLength={3}
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-slate-700">Current balance</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          required
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Add account'}
        </button>
      </div>
    </form>
  );
}
