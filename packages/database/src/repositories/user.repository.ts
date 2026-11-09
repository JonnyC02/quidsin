import { randomUUID } from 'node:crypto';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { GoogleProfile, Tenant, User, UserRepository } from '@quidsin/core';
import { keys, stripInternalAttributes } from '../table/schema.js';

export class DynamoUserRepository implements UserRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.user(id) }),
    );
    return result.Item ? stripInternalAttributes<User>(result.Item) : null;
  }

  async findOrCreateByGoogleProfile(
    profile: GoogleProfile,
  ): Promise<{ user: User; tenant: Tenant }> {
    const userId = profile.googleSub;
    const tenantId = randomUUID();
    const now = new Date().toISOString();

    const user: User = {
      id: userId,
      email: profile.email,
      tenantId,
      name: profile.name,
      createdAt: now,
      updatedAt: now,
    };
    const tenant: Tenant = {
      id: tenantId,
      name: profile.name ?? profile.email,
      ownerId: userId,
      createdAt: now,
    };

    // Create the tenant first: if the process dies before the conditional
    // user write below, an orphaned-but-harmless unreferenced tenant row
    // is strictly better than a user row pointing at a tenant that
    // doesn't exist.
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...keys.tenant(tenantId), entityType: 'Tenant', ...tenant },
      }),
    );

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { ...keys.user(userId), entityType: 'User', ...user },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        // Not the first sign-in for this Google account — read back the
        // existing user (and their actual tenant, not the one we just
        // speculatively created above).
        const existing = await this.findById(userId);
        if (existing) {
          const existingTenant = await this.docClient.send(
            new GetCommand({ TableName: this.tableName, Key: keys.tenant(existing.tenantId) }),
          );
          return { user: existing, tenant: stripInternalAttributes<Tenant>(existingTenant.Item!) };
        }
      }
      throw error;
    }

    return { user, tenant };
  }

  async delete(userId: string, tenantId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({ TableName: this.tableName, Key: keys.user(userId) }),
    );
    await this.docClient.send(
      new DeleteCommand({ TableName: this.tableName, Key: keys.tenant(tenantId) }),
    );
  }
}
