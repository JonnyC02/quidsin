import { BatchWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { PrimaryKey } from './schema.js';

const BATCH_WRITE_LIMIT = 25;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function batchDeleteByKeys(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  keysToDelete: readonly PrimaryKey[],
): Promise<void> {
  for (const batch of chunk(keysToDelete, BATCH_WRITE_LIMIT)) {
    if (batch.length === 0) {
      continue;
    }

    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: batch.map((key) => ({ DeleteRequest: { Key: key } })),
        },
      }),
    );
  }
}
