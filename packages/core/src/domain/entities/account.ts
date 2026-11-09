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
  /** false = Plaid-linked (plaidItemId/plaidAccountId are then both present). */
  isManual: boolean;
  /** Present iff isManual === false. */
  plaidItemId?: string;
  /** Present iff isManual === false. */
  plaidAccountId?: string;
  balanceUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}
