import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  NewTransaction,
  Transaction,
  TransactionFilter,
  TransactionRepository,
} from '@quidsin/core';
import { keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

const SK_PREFIX = 'TRANSACTION#';

export class DynamoTransactionRepository implements TransactionRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  /**
   * Add and modify are the same operation: the key is `TRANSACTION#<id>`
   * where id is Plaid's own stable transaction_id — never derived from
   * the (potentially changing) transaction date. A plain PutItem at this
   * key can never orphan a stale item the way a date-encoded key could
   * when Plaid "modifies" a transaction's date (e.g. pending -> posted).
   */
  async upsert(transaction: NewTransaction): Promise<Transaction> {
    const record: Transaction = { ...transaction };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...keys.transaction(transaction.tenantId, transaction.id),
          entityType: 'Transaction',
          ...record,
        },
      }),
    );

    return record;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({ TableName: this.tableName, Key: keys.transaction(tenantId, id) }),
    );
  }

  async list(tenantId: string, filter?: TransactionFilter): Promise<Transaction[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': keys.tenantPrefix(tenantId), ':prefix': SK_PREFIX },
      }),
    );

    let items = (result.Items ?? []).map((item) => stripInternalAttributes<Transaction>(item));

    if (filter?.accountId) {
      items = items.filter((t) => t.accountId === filter.accountId);
    }
    if (filter?.pending !== undefined) {
      items = items.filter((t) => t.pending === filter.pending);
    }
    if (filter?.startDate) {
      items = items.filter((t) => t.date >= filter.startDate!);
    }
    if (filter?.endDate) {
      items = items.filter((t) => t.date <= filter.endDate!);
    }
    if (filter?.search) {
      const query = filter.search.toLowerCase();
      items = items.filter(
        (t) =>
          t.description.toLowerCase().includes(query) ||
          (t.merchantName?.toLowerCase().includes(query) ?? false),
      );
    }

    return items;
  }

  async getById(tenantId: string, id: string): Promise<Transaction | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.transaction(tenantId, id) }),
    );
    return result.Item ? stripInternalAttributes<Transaction>(result.Item) : null;
  }

  async updateNotes(tenantId: string, id: string, notes: string, updatedAt: string): Promise<Transaction> {
    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.transaction(tenantId, id),
        UpdateExpression: 'SET notes = :notes, updatedAt = :updatedAt',
        ExpressionAttributeValues: { ':notes': notes, ':updatedAt': updatedAt },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return stripInternalAttributes<Transaction>(result.Attributes ?? {});
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': keys.tenantPrefix(tenantId), ':prefix': SK_PREFIX },
      }),
    );

    const itemKeys = (result.Items ?? []).map((item) => ({ pk: item.pk as string, sk: item.sk as string }));
    await batchDeleteByKeys(this.docClient, this.tableName, itemKeys);
  }
}
