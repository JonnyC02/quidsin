import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { NewPlaidItem, PlaidItem, PlaidItemRepository } from '@quidsin/core';
import { GSI1_NAME, gsi1, keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

export class DynamoPlaidItemRepository implements PlaidItemRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(item: NewPlaidItem): Promise<PlaidItem> {
    const record: PlaidItem = { ...item, status: 'active' };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...keys.plaidItem(item.tenantId, item.id),
          ...gsi1.plaidItemByPlaidId(item.id),
          entityType: 'PlaidItem',
          ...record,
        },
      }),
    );

    return record;
  }

  async updateCursor(tenantId: string, id: string, cursor: string, lastSyncedAt: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.plaidItem(tenantId, id),
        UpdateExpression: 'SET #cursor = :cursor, lastSyncedAt = :lastSyncedAt, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#cursor': 'cursor' },
        ExpressionAttributeValues: {
          ':cursor': cursor,
          ':lastSyncedAt': lastSyncedAt,
          ':updatedAt': lastSyncedAt,
        },
      }),
    );
  }

  async markError(tenantId: string, id: string, error: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.plaidItem(tenantId, id),
        UpdateExpression: 'SET #status = :status, lastError = :lastError, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'error',
          ':lastError': error,
          ':updatedAt': new Date().toISOString(),
        },
      }),
    );
  }

  async markDisconnected(tenantId: string, id: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.plaidItem(tenantId, id),
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'disconnected',
          ':updatedAt': new Date().toISOString(),
        },
      }),
    );
  }

  async getById(tenantId: string, id: string): Promise<PlaidItem | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.plaidItem(tenantId, id) }),
    );
    return result.Item ? stripInternalAttributes<PlaidItem>(result.Item) : null;
  }

  async findByPlaidItemId(plaidItemId: string): Promise<PlaidItem | null> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :gsi1pk',
        ExpressionAttributeValues: { ':gsi1pk': gsi1.plaidItemByPlaidId(plaidItemId).gsi1pk },
        Limit: 1,
      }),
    );

    const item = result.Items?.[0];
    return item ? stripInternalAttributes<PlaidItem>(item) : null;
  }

  async list(tenantId: string): Promise<PlaidItem[]> {
    const items = await this.queryTenant(tenantId);
    return items.map((item) => stripInternalAttributes<PlaidItem>(item));
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    const items = await this.queryTenant(tenantId);
    const itemKeys = items.map((item) => ({ pk: item.pk as string, sk: item.sk as string }));
    await batchDeleteByKeys(this.docClient, this.tableName, itemKeys);
  }

  private async queryTenant(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': keys.tenantPrefix(tenantId), ':prefix': 'PLAID_ITEM#' },
      }),
    );
    return result.Items ?? [];
  }
}
