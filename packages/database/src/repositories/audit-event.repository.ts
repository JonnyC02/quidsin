import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AuditEvent, AuditEventRepository, NewAuditEvent } from '@quidsin/core';
import { keys, stripInternalAttributes } from '../table/schema.js';
import { batchDeleteByKeys } from '../table/batch.js';

export class DynamoAuditEventRepository implements AuditEventRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(event: NewAuditEvent): Promise<AuditEvent> {
    const record: AuditEvent = { ...event };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...keys.auditEvent(event.tenantId, event.id), entityType: 'AuditEvent', ...record },
      }),
    );

    return record;
  }

  async listForTenant(tenantId: string): Promise<AuditEvent[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': keys.tenantPrefix(tenantId), ':prefix': 'AUDIT#' },
      }),
    );
    return (result.Items ?? [])
      .map((item) => stripInternalAttributes<AuditEvent>(item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    const events = await this.listForTenant(tenantId);
    await batchDeleteByKeys(
      this.docClient,
      this.tableName,
      events.map((event) => keys.auditEvent(event.tenantId, event.id)),
    );
  }
}
