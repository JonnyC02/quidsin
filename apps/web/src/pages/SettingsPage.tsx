import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api.js';
import { SESSION_QUERY_KEY } from '../lib/auth-context.js';

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'This permanently deletes your account and all of your income, expense, and account records. This cannot be undone. Continue?',
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await api.deleteCurrentUserAccount();
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      navigate('/login');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <section className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="text-sm font-semibold text-red-900">Delete account</h2>
        <p className="mt-1 text-sm text-red-700">
          Permanently deletes your account and all of your income, expense, and account records.
          This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => void handleDeleteAccount()}
          disabled={isDeleting}
          className="mt-4 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {isDeleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </section>
    </div>
  );
}
