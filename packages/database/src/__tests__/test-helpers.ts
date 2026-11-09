import { randomUUID } from 'node:crypto';
import { createDocumentClient, createDynamoDbClient, ensureTableExists } from '../index.js';
import {
  DynamoAccountRepository,
  DynamoExpenseRepository,
  DynamoIncomeRepository,
  DynamoSessionRepository,
  DynamoTenantRepository,
  DynamoUserRepository,
} from '../index.js';

export const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT;

/** Fresh table name per test file run, so test files never collide. */
export function uniqueTableName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export async function setUpTestTable(prefix: string) {
  if (!DYNAMODB_ENDPOINT) {
    throw new Error('DYNAMODB_ENDPOINT must be set to run database integration tests');
  }

  const tableName = uniqueTableName(prefix);
  const client = createDynamoDbClient({
    endpoint: DYNAMODB_ENDPOINT,
    region: 'local',
    accessKeyId: 'local',
    secretAccessKey: 'local',
  });
  const docClient = createDocumentClient(client);

  await ensureTableExists(client, tableName);

  return {
    tableName,
    docClient,
    userRepository: new DynamoUserRepository(docClient, tableName),
    tenantRepository: new DynamoTenantRepository(docClient, tableName),
    sessionRepository: new DynamoSessionRepository(docClient, tableName),
    incomeRepository: new DynamoIncomeRepository(docClient, tableName),
    expenseRepository: new DynamoExpenseRepository(docClient, tableName),
    accountRepository: new DynamoAccountRepository(docClient, tableName),
  };
}
