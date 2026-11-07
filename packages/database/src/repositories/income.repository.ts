import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { IncomeRepository, IncomeSource } from '@quidsin/core';
import { DynamoRecurringMoneyItemRepository } from './recurring-money-item.repository.js';

export class DynamoIncomeRepository
  extends DynamoRecurringMoneyItemRepository<IncomeSource>
  implements IncomeRepository
{
  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, tableName, 'income');
  }
}
