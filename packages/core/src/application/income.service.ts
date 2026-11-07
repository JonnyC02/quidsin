import type { IncomeSource } from '../domain/entities/income.js';
import { RecurringMoneyItemService } from './recurring-money-item.service.js';

export class IncomeService extends RecurringMoneyItemService<IncomeSource> {}
