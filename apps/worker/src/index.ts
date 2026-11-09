import { randomUUID } from 'node:crypto';
import { loadConfig } from '@quidsin/config';
import {
  createDocumentClient,
  createDynamoDbClient,
  DynamoAccountRepository,
  DynamoDbJobQueue,
  DynamoPlaidItemRepository,
  DynamoTransactionRepository,
  ensureTableExists,
} from '@quidsin/database';
import { AesGcmEncryptionService, SystemClock, TransactionSyncService } from '@quidsin/core';
import { createPlaidClient, PlaidBankingProvider } from '@quidsin/banking';
import { createApp } from './app.js';

const config = loadConfig();
const workerId = randomUUID();

const dynamoClient = createDynamoDbClient({
  endpoint: config.DYNAMODB_ENDPOINT,
  region: config.DYNAMODB_REGION,
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
});
const docClient = createDocumentClient(dynamoClient);
const tableName = config.DYNAMODB_TABLE_NAME;

await ensureTableExists(dynamoClient, tableName);

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

let lastPolledAt = Date.now();
// Healthy as long as the poll loop has completed an iteration within two
// poll intervals — one missed tick is noise, two means it's stuck.
const STALE_AFTER_MS = config.QUEUE_POLL_INTERVAL_MS * 2;

const app = createApp({ lastPolledAt: () => lastPolledAt, staleAfterMs: STALE_AFTER_MS });

app.listen(config.WORKER_PORT, () => {
  console.log(`[worker] listening on port ${config.WORKER_PORT}`);
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollLoop(): Promise<void> {
  for (;;) {
    try {
      const job = await jobQueue.claimNext(workerId, config.QUEUE_LEASE_DURATION_MS);

      if (job) {
        try {
          await transactionSyncService.processItem(job);
          await jobQueue.complete(job.plaidItemId);
        } catch (error) {
          // Never log the decrypted access token — only the item id.
          console.error(
            `[worker] sync failed for Plaid item ${job.plaidItemId}:`,
            error instanceof Error ? error.message : error,
          );
          await jobQueue.fail(job.plaidItemId, error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      console.error('[worker] poll loop error:', error instanceof Error ? error.message : error);
    }

    lastPolledAt = Date.now();
    await sleep(config.QUEUE_POLL_INTERVAL_MS);
  }
}

void pollLoop();
