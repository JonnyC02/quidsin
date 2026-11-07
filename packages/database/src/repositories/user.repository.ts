import { randomUUID } from 'node:crypto';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  ConflictError,
  type RegisterUserInput,
  type Tenant,
  type User,
  type UserRepository,
} from '@quidsin/core';
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

  async findByEmail(email: string): Promise<User | null> {
    const lock = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.emailLock(email) }),
    );

    if (!lock.Item) {
      return null;
    }

    return this.findById(lock.Item.userId as string);
  }

  async register(input: RegisterUserInput): Promise<{ user: User; tenant: Tenant }> {
    const userId = randomUUID();
    const tenantId = randomUUID();
    const now = new Date().toISOString();

    const user: User = {
      id: userId,
      email: input.email,
      passwordHash: input.passwordHash,
      tenantId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    const tenant: Tenant = {
      id: tenantId,
      name: input.name ?? input.email,
      ownerId: userId,
      createdAt: now,
    };

    try {
      await this.docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: { ...keys.emailLock(input.email), entityType: 'EmailLock', userId },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: { ...keys.user(userId), entityType: 'User', ...user },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: { ...keys.tenant(tenantId), entityType: 'Tenant', ...tenant },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        throw new ConflictError('Email already registered');
      }
      throw error;
    }

    return { user, tenant };
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.user(userId),
        UpdateExpression: 'SET passwordHash = :passwordHash, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':passwordHash': passwordHash,
          ':updatedAt': new Date().toISOString(),
        },
      }),
    );
  }

  async delete(userId: string, tenantId: string): Promise<void> {
    const user = await this.findById(userId);

    await this.docClient.send(
      new DeleteCommand({ TableName: this.tableName, Key: keys.user(userId) }),
    );
    await this.docClient.send(
      new DeleteCommand({ TableName: this.tableName, Key: keys.tenant(tenantId) }),
    );

    if (user) {
      await this.docClient.send(
        new DeleteCommand({ TableName: this.tableName, Key: keys.emailLock(user.email) }),
      );
    }
  }
}
