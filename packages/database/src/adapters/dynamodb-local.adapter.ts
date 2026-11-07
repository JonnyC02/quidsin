import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import type { HealthCheckable } from '../ports/health-checkable.js';

export interface DynamoDbLocalAdapterOptions {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class DynamoDbLocalAdapter implements HealthCheckable {
  private readonly client: DynamoDBClient;

  constructor(options: DynamoDbLocalAdapterOptions) {
    this.client = new DynamoDBClient({
      endpoint: options.endpoint,
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async ping(): Promise<boolean> {
    await this.client.send(new ListTablesCommand({}));
    return true;
  }
}
