import type {
  Account,
  AccountType,
  DashboardSummary,
  Frequency,
  IncomeSource,
  RecurringExpense,
  Transaction,
} from '@quidsin/core';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  code: string;
  status: number;
  issues?: string[];

  constructor(message: string, code: string, status: number, issues?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = (
      body as { error?: { message?: string; code?: string; issues?: string[] } } | null
    )?.error;
    throw new ApiError(
      errorBody?.message ?? `Request failed with status ${response.status}`,
      errorBody?.code ?? 'UNKNOWN',
      response.status,
      errorBody?.issues,
    );
  }

  return body as T;
}

// --- Auth ---------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  tenantId: string;
}

export function loginWithGoogle(idToken: string): Promise<{ user: AuthUser }> {
  return request('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) });
}

export function logout(): Promise<void> {
  return request('/auth/logout', { method: 'POST' });
}

export function getCurrentSession(): Promise<{ userId: string; tenantId: string }> {
  return request('/auth/me');
}

export function deleteCurrentUserAccount(): Promise<void> {
  return request('/auth/account', { method: 'DELETE' });
}

// --- Income / Expenses (identical shape; kept as separate named groups
// since they hit different base paths) -----------------------------------

export interface RecurringMoneyItemInput {
  name: string;
  amountMinorUnits: number;
  frequency: Frequency;
  anchorDate: string;
  description?: string;
}

function listRecurringMoneyItems<T>(basePath: string): Promise<T[]> {
  return request<{ items: T[] }>(basePath).then((r) => r.items);
}
function createRecurringMoneyItem<T>(basePath: string, input: RecurringMoneyItemInput): Promise<T> {
  return request<{ item: T }>(basePath, { method: 'POST', body: JSON.stringify(input) }).then(
    (r) => r.item,
  );
}
function updateRecurringMoneyItem<T>(
  basePath: string,
  id: string,
  input: Partial<RecurringMoneyItemInput>,
): Promise<T> {
  return request<{ item: T }>(`${basePath}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.item);
}
function setRecurringMoneyItemActive<T>(basePath: string, id: string, active: boolean): Promise<T> {
  return request<{ item: T }>(`${basePath}/${id}/${active ? 'reactivate' : 'deactivate'}`, {
    method: 'POST',
  }).then((r) => r.item);
}
function removeRecurringMoneyItem(basePath: string, id: string): Promise<void> {
  return request(`${basePath}/${id}`, { method: 'DELETE' });
}

export const income = {
  list: () => listRecurringMoneyItems<IncomeSource>('/income'),
  create: (input: RecurringMoneyItemInput) =>
    createRecurringMoneyItem<IncomeSource>('/income', input),
  update: (id: string, input: Partial<RecurringMoneyItemInput>) =>
    updateRecurringMoneyItem<IncomeSource>('/income', id, input),
  setActive: (id: string, active: boolean) =>
    setRecurringMoneyItemActive<IncomeSource>('/income', id, active),
  remove: (id: string) => removeRecurringMoneyItem('/income', id),
};

export const expenses = {
  list: () => listRecurringMoneyItems<RecurringExpense>('/expenses'),
  create: (input: RecurringMoneyItemInput) =>
    createRecurringMoneyItem<RecurringExpense>('/expenses', input),
  update: (id: string, input: Partial<RecurringMoneyItemInput>) =>
    updateRecurringMoneyItem<RecurringExpense>('/expenses', id, input),
  setActive: (id: string, active: boolean) =>
    setRecurringMoneyItemActive<RecurringExpense>('/expenses', id, active),
  remove: (id: string) => removeRecurringMoneyItem('/expenses', id),
};

// --- Accounts -------------------------------------------------------------

export interface AccountInput {
  name: string;
  type: AccountType;
  institutionName?: string;
  currency: string;
  balanceMinorUnits: number;
  description?: string;
}

export const accounts = {
  list: () => request<{ accounts: Account[] }>('/accounts').then((r) => r.accounts),
  create: (input: AccountInput) =>
    request<{ account: Account }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((r) => r.account),
  update: (id: string, input: Partial<Omit<AccountInput, 'balanceMinorUnits'>>) =>
    request<{ account: Account }>(`/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }).then((r) => r.account),
  updateBalance: (id: string, balanceMinorUnits: number) =>
    request<{ account: Account }>(`/accounts/${id}/balance`, {
      method: 'POST',
      body: JSON.stringify({ balanceMinorUnits }),
    }).then((r) => r.account),
  remove: (id: string) => request<void>(`/accounts/${id}`, { method: 'DELETE' }),
};

// --- Dashboard --------------------------------------------------------

export function getDashboardSummary(): Promise<DashboardSummary> {
  return request('/dashboard');
}

// --- Plaid bank connections --------------------------------------------

export const plaid = {
  createLinkToken: () => request<{ linkToken: string }>('/plaid/link-token', { method: 'POST' }),
  exchangePublicToken: (publicToken: string) =>
    request<{ accounts: Account[] }>('/plaid/exchange', {
      method: 'POST',
      body: JSON.stringify({ publicToken }),
    }).then((r) => r.accounts),
  disconnectItem: (plaidItemId: string) =>
    request<void>(`/plaid/items/${plaidItemId}/disconnect`, { method: 'POST' }),
  triggerSync: (plaidItemId: string) =>
    request<void>(`/plaid/items/${plaidItemId}/sync`, { method: 'POST' }),
};

// --- Transactions --------------------------------------------------------

export interface TransactionFilter {
  accountId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  pending?: boolean;
}

export const transactions = {
  list: (filter?: TransactionFilter) => {
    const query = new URLSearchParams();
    if (filter?.accountId) query.set('accountId', filter.accountId);
    if (filter?.search) query.set('search', filter.search);
    if (filter?.startDate) query.set('startDate', filter.startDate);
    if (filter?.endDate) query.set('endDate', filter.endDate);
    if (filter?.pending !== undefined) query.set('pending', String(filter.pending));
    const queryString = query.toString();

    return request<{ transactions: Transaction[] }>(
      `/transactions${queryString ? `?${queryString}` : ''}`,
    ).then((r) => r.transactions);
  },
  updateNotes: (id: string, notes: string) =>
    request<{ transaction: Transaction }>(`/transactions/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }).then((r) => r.transaction),
};
