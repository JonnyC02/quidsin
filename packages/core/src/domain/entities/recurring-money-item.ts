import type { Frequency } from './frequency.js';
import type { Visibility } from './visibility.js';

/**
 * Shared shape for IncomeSource and RecurringExpense. Phase 2 treats them
 * identically; kept as distinct named types (not a single generic "item
 * type" entity) so future divergence between income and expense semantics
 * doesn't require a breaking rename.
 */
export interface RecurringMoneyItem {
  id: string;
  tenantId: string;
  ownerId: string;
  visibility: Visibility;
  name: string;
  amountMinorUnits: number;
  frequency: Frequency;
  /** ISO date (YYYY-MM-DD) of a known occurrence, used to project future ones. */
  anchorDate: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
