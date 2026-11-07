import type { RecurringExpense } from '../domain/entities/expense.js';
import type { RecurringMoneyItemRepository } from './recurring-money-item-repository.js';

export type ExpenseRepository = RecurringMoneyItemRepository<RecurringExpense>;

export type {
  NewRecurringMoneyItem as NewRecurringExpense,
  RecurringMoneyItemPatch as RecurringExpensePatch,
} from './recurring-money-item-repository.js';
