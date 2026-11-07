import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { NewSession, Session, SessionRepository } from '@quidsin/core';
import { GSI1_NAME, gsi1, keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

function toEpochSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

export class DynamoSessionRepository implements SessionRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(session: NewSession): Promise<Session> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...keys.session(session.id),
          ...gsi1.sessionByUser(session.userId, session.id),
          entityType: 'Session',
          ttl: toEpochSeconds(session.expiresAt),
          ...session,
        },
      }),
    );
    return { ...session };
  }

  async findById(id: string): Promise<Session | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.session(id) }),
    );
    return result.Item ? stripInternalAttributes<Session>(result.Item) : null;
  }

  async touch(id: string, expiresAt: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.session(id),
        UpdateExpression: 'SET expiresAt = :expiresAt, #ttl = :ttl',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':expiresAt': expiresAt,
          ':ttl': toEpochSeconds(expiresAt),
        },
      }),
    );
  }

  async delete(id: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({ TableName: this.tableName, Key: keys.session(id) }),
    );
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :gsi1pk AND begins_with(gsi1sk, :prefix)',
        ExpressionAttributeValues: { ':gsi1pk': gsi1.userPrefix(userId), ':prefix': 'SESSION#' },
      }),
    );

    const sessionKeys = (result.Items ?? []).map((item) => ({
      pk: item.pk as string,
      sk: item.sk as string,
    }));
    await batchDeleteByKeys(this.docClient, this.tableName, sessionKeys);
  }
}
