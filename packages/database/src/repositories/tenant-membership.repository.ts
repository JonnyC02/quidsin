import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { TenantMembership, TenantMembershipRepository, TenantRole } from '@quidsin/core';
import { GSI1_NAME, gsi1, keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

export class DynamoTenantMembershipRepository implements TenantMembershipRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async ensureMembership(
    tenantId: string,
    userId: string,
    role: TenantRole,
    createdAt: string,
  ): Promise<TenantMembership> {
    const record: TenantMembership = { tenantId, userId, role, createdAt };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            ...keys.membership(tenantId, userId),
            ...gsi1.membershipByUser(userId, tenantId),
            entityType: 'TenantMembership',
            ...record,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return record;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        const existing = await this.docClient.send(
          new GetCommand({ TableName: this.tableName, Key: keys.membership(tenantId, userId) }),
        );
        return stripInternalAttributes<TenantMembership>(existing.Item!);
      }
      throw error;
    }
  }

  async getRole(tenantId: string, userId: string): Promise<TenantRole | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.membership(tenantId, userId) }),
    );
    return result.Item ? (result.Item.role as TenantRole) : null;
  }

  async listForTenant(tenantId: string): Promise<TenantMembership[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': keys.tenantPrefix(tenantId), ':prefix': 'MEMBER#' },
      }),
    );
    return (result.Items ?? []).map((item) => stripInternalAttributes<TenantMembership>(item));
  }

  async listForUser(userId: string): Promise<TenantMembership[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :gsi1pk AND begins_with(gsi1sk, :prefix)',
        ExpressionAttributeValues: { ':gsi1pk': gsi1.userPrefix(userId), ':prefix': 'MEMBERSHIP#' },
      }),
    );
    return (result.Items ?? []).map((item) => stripInternalAttributes<TenantMembership>(item));
  }

  async remove(tenantId: string, userId: string): Promise<void> {
    await batchDeleteByKeys(this.docClient, this.tableName, [keys.membership(tenantId, userId)]);
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    const members = await this.listForTenant(tenantId);
    await batchDeleteByKeys(
      this.docClient,
      this.tableName,
      members.map((member) => keys.membership(member.tenantId, member.userId)),
    );
  }
}

