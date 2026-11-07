import type { IncomeSource } from '../domain/entities/income.js';
import type { RecurringMoneyItemRepository } from './recurring-money-item-repository.js';

export type IncomeRepository = RecurringMoneyItemRepository<IncomeSource>;

export type {
  NewRecurringMoneyItem as NewIncomeSource,
  RecurringMoneyItemPatch as IncomeSourcePatch,
} from './recurring-money-item-repository.js';
