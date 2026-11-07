import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  NewPasswordResetToken,
  PasswordResetToken,
  PasswordResetTokenRepository,
} from '@quidsin/core';
import { GSI1_NAME, gsi1, keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

function toEpochSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

export class DynamoPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(token: NewPasswordResetToken): Promise<PasswordResetToken> {
    const record: PasswordResetToken = { ...token, used: false };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...keys.passwordResetToken(token.tokenHash),
          ...gsi1.resetTokenByUser(token.userId, token.id),
          entityType: 'PasswordResetToken',
          ttl: toEpochSeconds(token.expiresAt),
          ...record,
        },
      }),
    );

    return record;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.passwordResetToken(tokenHash) }),
    );
    return result.Item ? stripInternalAttributes<PasswordResetToken>(result.Item) : null;
  }

  async markUsed(tokenHash: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.passwordResetToken(tokenHash),
        UpdateExpression: 'SET used = :used',
        ExpressionAttributeValues: { ':used': true },
      }),
    );
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :gsi1pk AND begins_with(gsi1sk, :prefix)',
        ExpressionAttributeValues: { ':gsi1pk': gsi1.userPrefix(userId), ':prefix': 'RESET#' },
      }),
    );

    const tokenKeys = (result.Items ?? []).map((item) => ({
      pk: item.pk as string,
      sk: item.sk as string,
    }));
    await batchDeleteByKeys(this.docClient, this.tableName, tokenKeys);
  }
}
