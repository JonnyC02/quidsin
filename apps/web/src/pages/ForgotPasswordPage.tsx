import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await api.requestPasswordReset(email);
    } finally {
      setIsSubmitting(false);
      // Always show the same confirmation, regardless of whether the
      // email is registered — the API itself never reveals that either.
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-600">
          If that email is registered, a password reset link has been sent.
        </p>
        <Link to="/login" className="text-sm font-medium text-slate-900 underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link to="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
