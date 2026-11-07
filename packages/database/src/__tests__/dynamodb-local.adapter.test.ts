import { describe, expect, it } from 'vitest';
import { DynamoDbLocalAdapter } from '../adapters/dynamodb-local.adapter.js';

const endpoint = process.env.DYNAMODB_ENDPOINT;

describe.skipIf(!endpoint)('DynamoDbLocalAdapter (live)', () => {
  it('pings a reachable DynamoDB Local instance', async () => {
    const adapter = new DynamoDbLocalAdapter({
      endpoint: endpoint as string,
      region: 'local',
      accessKeyId: 'local',
      secretAccessKey: 'local',
    });

    await expect(adapter.ping()).resolves.toBe(true);
  });
});
