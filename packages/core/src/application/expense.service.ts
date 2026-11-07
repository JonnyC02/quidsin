import type { RecurringExpense } from '../domain/entities/expense.js';
import { RecurringMoneyItemService } from './recurring-money-item.service.js';

export class ExpenseService extends RecurringMoneyItemService<RecurringExpense> {}
