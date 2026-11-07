import type { HealthCheckable } from '../ports/health-checkable.js';

export interface DynamoDbAwsAdapterOptions {
  region: string;
}

/**
 * Stub seam for the real AWS-managed DynamoDB adapter, implemented when
 * the SAM/Lambda deployment phase actually targets AWS.
 */
export class DynamoDbAwsAdapter implements HealthCheckable {
  constructor(private readonly options: DynamoDbAwsAdapterOptions) {}

  async ping(): Promise<boolean> {
    throw new Error(`Not implemented (region: ${this.options.region})`);
  }
}
