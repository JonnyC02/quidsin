import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Account, AccountPatch, AccountRepository, NewAccount } from '@quidsin/core';
import { keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

const SK_PREFIX = 'ACCOUNT#';

export class DynamoAccountRepository implements AccountRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(account: NewAccount): Promise<Account> {
    const record: Account = {
      ...account,
      visibility: 'private',
      isManual: account.isManual ?? true,
      balanceUpdatedAt: account.updatedAt,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...keys.account(account.tenantId, account.id), entityType: 'Account', ...record },
      }),
    );

    return record;
  }

  async update(tenantId: string, id: string, patch: AccountPatch): Promise<Account> {
    const { names, values, expression } = buildUpdateExpression(patch);

    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.account(tenantId, id),
        UpdateExpression: expression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }),
    );

    return stripInternalAttributes<Account>(result.Attributes ?? {});
  }

  async updateBalance(
    tenantId: string,
    id: string,
    balanceMinorUnits: number,
    balanceUpdatedAt: string,
  ): Promise<Account> {
    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.account(tenantId, id),
        UpdateExpression: 'SET balanceMinorUnits = :balance, balanceUpdatedAt = :balanceUpdatedAt',
        ExpressionAttributeValues: {
          ':balance': balanceMinorUnits,
          ':balanceUpdatedAt': balanceUpdatedAt,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return stripInternalAttributes<Account>(result.Attributes ?? {});
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({ TableName: this.tableName, Key: keys.account(tenantId, id) }),
    );
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    const items = await this.queryTenant(tenantId);
    const itemKeys = items.map((item) => ({ pk: item.pk as string, sk: item.sk as string }));
    await batchDeleteByKeys(this.docClient, this.tableName, itemKeys);
  }

  async list(tenantId: string): Promise<Account[]> {
    const items = await this.queryTenant(tenantId);
    return items.map((item) => stripInternalAttributes<Account>(item));
  }

  async getById(tenantId: string, id: string): Promise<Account | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.account(tenantId, id) }),
    );
    return result.Item ? stripInternalAttributes<Account>(result.Item) : null;
  }

  private async queryTenant(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': keys.tenantPrefix(tenantId), ':prefix': SK_PREFIX },
      }),
    );
    return result.Items ?? [];
  }
}

function buildUpdateExpression(patch: AccountPatch): {
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
