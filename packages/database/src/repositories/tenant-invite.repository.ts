import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { InviteStatus, NewTenantInvite, TenantInvite, TenantInviteRepository } from '@quidsin/core';
import { GSI1_NAME, gsi1, keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

export class DynamoTenantInviteRepository implements TenantInviteRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(invite: NewTenantInvite): Promise<TenantInvite> {
    const record: TenantInvite = { ...invite, status: 'pending' };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...keys.invite(invite.tenantId, invite.id),
          ...gsi1.inviteByEmail(invite.invitedEmail, invite.id),
          entityType: 'TenantInvite',
          ...record,
        },
      }),
    );

    return record;
  }

  async getById(tenantId: string, id: string): Promise<TenantInvite | null> {
    const result = await this.docClient.send(
      new GetCommand({ TableName: this.tableName, Key: keys.invite(tenantId, id) }),
    );
    return result.Item ? stripInternalAttributes<TenantInvite>(result.Item) : null;
  }

  async listForTenant(tenantId: string): Promise<TenantInvite[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': keys.tenantPrefix(tenantId), ':prefix': 'INVITE#' },
      }),
    );
    return (result.Items ?? []).map((item) => stripInternalAttributes<TenantInvite>(item));
  }

  async listPendingByEmail(email: string): Promise<TenantInvite[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :gsi1pk',
        ExpressionAttributeValues: { ':gsi1pk': gsi1.inviteEmailPrefix(email) },
      }),
    );
    return (result.Items ?? [])
      .map((item) => stripInternalAttributes<TenantInvite>(item))
      .filter((invite) => invite.status === 'pending');
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: InviteStatus,
    respondedAt: string,
  ): Promise<TenantInvite> {
    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: keys.invite(tenantId, id),
        UpdateExpression: 'SET #status = :status, respondedAt = :respondedAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status, ':respondedAt': respondedAt },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return stripInternalAttributes<TenantInvite>(result.Attributes!);
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    const invites = await this.listForTenant(tenantId);
    await batchDeleteByKeys(
      this.docClient,
      this.tableName,
      invites.map((invite) => keys.invite(invite.tenantId, invite.id)),
    );
  }
}
