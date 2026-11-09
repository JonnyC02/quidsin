export interface Transaction {
  /** Plaid's own transaction_id — stable across add/modify, never re-keyed. */
  id: string;
  tenantId: string;
  accountId: string;
  plaidAccountId: string;
  /** Plaid convention: positive = money out, negative = money in. */
  amountMinorUnits: number;
  currency: string;
  description: string;
  merchantName?: string;
  date: string;
  pending: boolean;
  /** The only user-editable field. */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
