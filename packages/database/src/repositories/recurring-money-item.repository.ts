import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  NewRecurringMoneyItem,
  RecurringMoneyItem,
  RecurringMoneyItemPatch,
  RecurringMoneyItemRepository,
} from '@quidsin/core';
import { keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

export type RecurringMoneyItemKind = 'income' | 'expense';

const SK_PREFIX: Record<RecurringMoneyItemKind, string> = {
  income: 'INCOME#',
  expense: 'EXPENSE#',
};

const ENTITY_TYPE: Record<RecurringMoneyItemKind, string> = {
  income: 'IncomeSource',
  expense: 'RecurringExpense',
};

/**
 * Shared DynamoDB implementation for income and expense repositories —
 * they're structurally identical in Phase 2, differing only by their sort
 * key prefix. `DynamoIncomeRepository`/`DynamoExpenseRepository` are thin
 * named subclasses over this, matching the port-per-concern design in
 * packages/core.
 */
export class DynamoRecurringMoneyItemRepository<
  T extends RecurringMoneyItem,
> implements RecurringMoneyItemRepository<T> {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly kind: RecurringMoneyItemKind,
  ) {}

  async create(item: NewRecurringMoneyItem): Promise<T> {
    const record = {
      ...item,
      visibility: 'private' as const,
      active: true,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: keys.tenantPrefix(item.tenantId),
          sk: `${SK_PREFIX[this.kind]}${item.id}`,
          entityType: ENTITY_TYPE[this.kind],
          ...record,
        },
      }),
    );

    return record as unknown as T;
  }

  async update(tenantId: string, id: string, patch: RecurringMoneyItemPatch): Promise<T> {
    const { names, values, expression } = buildUpdateExpression(patch);

    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: this.key(tenantId, id),
        UpdateExpression: expression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }),
    );

    return stripInternalAttributes<T>(result.Attributes ?? {});
  }

  async setActive(tenantId: string, id: string, active: boolean, updatedAt: string): Promise<T> {
    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: this.key(tenantId, id),
        UpdateExpression: 'SET active = :active, updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':active': active, ':updatedAt': updatedAt },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return stripInternalAttributes<T>(result.Attributes ?? {});
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({ TableName: this.tableName, Key: this.key(tenantId, id) }),
    );
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    const items = await this.queryTenant(tenantId);
    const itemKeys = items.map((item) => ({ pk: item.pk as string, sk: item.sk as string }));
    await batchDeleteByKeys(this.docClient, this.tableName, itemKeys);
  }

  async list(tenantId: string): Promise<T[]> {
    const items = await this.queryTenant(tenantId);
    return items.map((item) => stripInternalAttributes<T>(item));
  }

  async getById(tenantId: string, id: string): Promise<T | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: this.key(tenantId, id) }),
    );
    return result.Item ? stripInternalAttributes<T>(result.Item) : null;
  }

  private key(tenantId: string, id: string) {
    return { pk: keys.tenantPrefix(tenantId), sk: `${SK_PREFIX[this.kind]}${id}` };
  }

  private async queryTenant(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': keys.tenantPrefix(tenantId),
          ':prefix': SK_PREFIX[this.kind],
        },
      }),
    );
    return result.Items ?? [];
  }
}

function buildUpdateExpression(patch: RecurringMoneyItemPatch): {
  names: Record<string, string>;
  values: Record<string, unknown>;
  expression: string;
} {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setClauses: string[] = [];

  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    names[`#${field}`] = field;
    values[`:${field}`] = value;
    setClauses.push(`#${field} = :${field}`);
  }

  return { names, values, expression: `SET ${setClauses.join(', ')}` };
}
