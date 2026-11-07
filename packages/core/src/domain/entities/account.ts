import type { Visibility } from './visibility.js';

export type AccountType =
  'current' | 'savings' | 'isa_cash' | 'isa_stocks_and_shares' | 'credit_card' | 'other';

export interface Account {
  id: string;
  tenantId: string;
  ownerId: string;
  visibility: Visibility;
  name: string;
  type: AccountType;
  institutionName?: string;
  currency: string;
  balanceMinorUnits: number;
  description?: string;
  /** Always true in Phase 2 — connected (Plaid) accounts land in Phase 3. */
  isManual: true;
  balanceUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}
