import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import type { HealthCheckable } from '../ports/health-checkable.js';

export interface DynamoDbAwsAdapterOptions {
  region: string;
}

/**
 * The managed-AWS counterpart to DynamoDbLocalAdapter. No explicit
 * endpoint or credentials — inside Lambda, the SDK resolves both from the
 * execution role automatically.
 */
export class DynamoDbAwsAdapter implements HealthCheckable {
  private readonly client: DynamoDBClient;

  constructor(options: DynamoDbAwsAdapterOptions) {
    this.client = new DynamoDBClient({ region: options.region });
  }

  async ping(): Promise<boolean> {
    await this.client.send(new ListTablesCommand({}));
    return true;
  }
}
