import type { RecurringMoneyItem } from '../domain/entities/recurring-money-item.js';
import type { Visibility } from '../domain/entities/visibility.js';

export interface NewRecurringMoneyItem {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  amountMinorUnits: number;
  frequency: RecurringMoneyItem['frequency'];
  anchorDate: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringMoneyItemPatch {
  name?: string;
  amountMinorUnits?: number;
  frequency?: RecurringMoneyItem['frequency'];
  anchorDate?: string;
  description?: string;
  visibility?: Visibility;
  sharedWithUserIds?: string[];
  updatedAt: string;
}

/**
 * Shared shape for the income and expense repositories — they're
 * structurally identical in Phase 2. `IncomeRepository`/`ExpenseRepository`
 * are distinct named aliases (not direct uses of this generic) so a future
 * divergence doesn't ripple through every call site.
 */
export interface RecurringMoneyItemRepository<T extends RecurringMoneyItem> {
  create(item: NewRecurringMoneyItem): Promise<T>;
  update(tenantId: string, id: string, patch: RecurringMoneyItemPatch): Promise<T>;
  setActive(tenantId: string, id: string, active: boolean, updatedAt: string): Promise<T>;
  remove(tenantId: string, id: string): Promise<void>;
  removeAllForTenant(tenantId: string): Promise<void>;
  list(tenantId: string): Promise<T[]>;
  getById(tenantId: string, id: string): Promise<T | null>;
}
