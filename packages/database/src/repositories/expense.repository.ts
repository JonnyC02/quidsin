import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ExpenseRepository, RecurringExpense } from '@quidsin/core';
import { DynamoRecurringMoneyItemRepository } from './recurring-money-item.repository.js';

export class DynamoExpenseRepository
  extends DynamoRecurringMoneyItemRepository<RecurringExpense>
  implements ExpenseRepository
{
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, tableName, 'expense');
  }
}
