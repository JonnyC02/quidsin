import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { Config } from '@quidsin/config';
import {
  createDocumentClient,
  DynamoAccountRepository,
  DynamoDbJobQueue,
  DynamoPlaidItemRepository,
  DynamoTransactionRepository,
} from '@quidsin/database';
import { AesGcmEncryptionService, SystemClock, TransactionSyncService } from '@quidsin/core';
import { createPlaidClient, PlaidBankingProvider } from '@quidsin/banking';
import type { JobQueue } from '@quidsin/core';

export interface BuildWorkerDeps {
  dynamoClient: DynamoDBClient;
}

export interface Worker {
  jobQueue: JobQueue;
  transactionSyncService: TransactionSyncService;
}

/**
 * Everything the worker needs, built from an already-constructed DynamoDB
 * client — the only thing that differs between the self-hosted entrypoint
 * (src/index.ts, local creds/endpoint, calls ensureTableExists first) and
 * the scheduled-Lambda entrypoint (src/lambda.ts, execution-role creds, a
 * CloudFormation-managed table). Doesn't call ensureTableExists itself.
 */
export function buildWorker(config: Config, deps: BuildWorkerDeps): Worker {
  const docClient = createDocumentClient(deps.dynamoClient);
  const tableName = config.DYNAMODB_TABLE_NAME;

  const accountRepository = new DynamoAccountRepository(docClient, tableName);
  const plaidItemRepository = new DynamoPlaidItemRepository(docClient, tableName);
  const transactionRepository = new DynamoTransactionRepository(docClient, tableName);
  const jobQueue = new DynamoDbJobQueue(docClient, tableName);

  const clock = new SystemClock();
  const encryptionService = new AesGcmEncryptionService(Buffer.from(config.ENCRYPTION_KEY, 'base64'));
  const bankingProvider = new PlaidBankingProvider(
    createPlaidClient({
      clientId: config.PLAID_CLIENT_ID,
      secret: config.PLAID_SECRET,
      environment: config.PLAID_ENV,
    }),
    {
      clientName: 'QuidsIn',
      countryCodes: config.PLAID_COUNTRY_CODES.split(',').map((code) => code.trim()),
    },
  );

  const transactionSyncService = new TransactionSyncService({
    bankingProvider,
    plaidItemRepository,
    transactionRepository,
    accountRepository,
    encryptionService,
    clock,
  });

  return { jobQueue, transactionSyncService };
}
