import type { Account, AccountType } from '../domain/entities/account.js';

export interface NewAccount {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  type: AccountType;
  institutionName?: string;
  currency: string;
  balanceMinorUnits: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountPatch {
  name?: string;
  type?: AccountType;
  institutionName?: string;
  currency?: string;
  description?: string;
  updatedAt: string;
}

export interface AccountRepository {
  create(account: NewAccount): Promise<Account>;
  update(tenantId: string, id: string, patch: AccountPatch): Promise<Account>;
  updateBalance(
    tenantId: string,
    id: string,
    balanceMinorUnits: number,
    balanceUpdatedAt: string,
  ): Promise<Account>;
  remove(tenantId: string, id: string): Promise<void>;
  removeAllForTenant(tenantId: string): Promise<void>;
  list(tenantId: string): Promise<Account[]>;
  getById(tenantId: string, id: string): Promise<Account | null>;
}
