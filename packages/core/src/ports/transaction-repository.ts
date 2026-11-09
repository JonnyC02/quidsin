import type { Transaction } from '../domain/entities/transaction.js';

export interface NewTransaction {
  id: string;
  tenantId: string;
  accountId: string;
  plaidAccountId: string;
  amountMinorUnits: number;
  currency: string;
  description: string;
  merchantName?: string;
  date: string;
  pending: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionFilter {
  accountId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  pending?: boolean;
}

export interface TransactionRepository {
  /** Add and modify are the same operation — see Transaction.id's doc comment. */
  upsert(transaction: NewTransaction): Promise<Transaction>;
  remove(tenantId: string, id: string): Promise<void>;
  list(tenantId: string, filter?: TransactionFilter): Promise<Transaction[]>;
  getById(tenantId: string, id: string): Promise<Transaction | null>;
  updateNotes(tenantId: string, id: string, notes: string, updatedAt: string): Promise<Transaction>;
  removeAllForTenant(tenantId: string): Promise<void>;
}
