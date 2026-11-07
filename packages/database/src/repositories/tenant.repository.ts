import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Tenant, TenantRepository } from '@quidsin/core';
import { keys, stripInternalAttributes } from '../table/schema.js';

export class DynamoTenantRepository implements TenantRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findById(id: string): Promise<Tenant | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.tenant(id) }),
    );
    return result.Item ? stripInternalAttributes<Tenant>(result.Item) : null;
  }
}
