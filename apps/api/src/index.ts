import { loadConfig } from '@quidsin/config';
import {
  createDocumentClient,
  createDynamoDbClient,
  DynamoDbLocalAdapter,
  DynamoAccountRepository,
  DynamoDbJobQueue,
  DynamoExpenseRepository,
  DynamoIncomeRepository,
  DynamoPlaidItemRepository,
  DynamoSessionRepository,
  DynamoTransactionRepository,
  DynamoUserRepository,
  ensureTableExists,
} from '@quidsin/database';
import {
  AccountService,
  AesGcmEncryptionService,
  AuthService,
  BankConnectionService,
  DashboardService,
  ExpenseService,
  IncomeService,
  PlaidWebhookService,
  RandomUuidGenerator,
  SystemClock,
  TransactionService,
} from '@quidsin/core';
import { createPlaidClient, PlaidBankingProvider } from '@quidsin/banking';
import { createApp } from './app.js';
import { GoogleAuthLibraryIdentityVerifier } from './infra/google-identity-verifier.js';

const config = loadConfig();

const database = new DynamoDbLocalAdapter({
  endpoint: config.DYNAMODB_ENDPOINT,
  region: config.DYNAMODB_REGION,
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
});

const dynamoClient = createDynamoDbClient({
  endpoint: config.DYNAMODB_ENDPOINT,
  region: config.DYNAMODB_REGION,
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
});
const docClient = createDocumentClient(dynamoClient);
const tableName = config.DYNAMODB_TABLE_NAME;

await ensureTableExists(dynamoClient, tableName);

const userRepository = new DynamoUserRepository(docClient, tableName);
const sessionRepository = new DynamoSessionRepository(docClient, tableName);
const incomeRepository = new DynamoIncomeRepository(docClient, tableName);
const expenseRepository = new DynamoExpenseRepository(docClient, tableName);
const accountRepository = new DynamoAccountRepository(docClient, tableName);
const plaidItemRepository = new DynamoPlaidItemRepository(docClient, tableName);
const transactionRepository = new DynamoTransactionRepository(docClient, tableName);
const jobQueue = new DynamoDbJobQueue(docClient, tableName);

const clock = new SystemClock();
const idGenerator = new RandomUuidGenerator();
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

const authService = new AuthService({
  userRepository,
  sessionRepository,
  googleIdentityVerifier: new GoogleAuthLibraryIdentityVerifier(config.GOOGLE_CLIENT_ID),
  incomeRepository,
  expenseRepository,
  accountRepository,
  plaidItemRepository,
  transactionRepository,
  bankingProvider,
  encryptionService,
  clock,
  idGenerator,
  config: {
    sessionDurationHours: config.SESSION_DURATION_HOURS,
  },
});

const incomeService = new IncomeService({ repository: incomeRepository, clock, idGenerator });
const expenseService = new ExpenseService({ repository: expenseRepository, clock, idGenerator });
const accountService = new AccountService({ repository: accountRepository, clock, idGenerator });
const dashboardService = new DashboardService({
  incomeRepository,
  expenseRepository,
  accountRepository,
  clock,
});
const bankConnectionService = new BankConnectionService({
  bankingProvider,
  plaidItemRepository,
  accountRepository,
  jobQueue,
  encryptionService,
  clock,
  idGenerator,
  config: {
    webhookUrl: config.PLAID_WEBHOOK_URL,
  },
});
const transactionService = new TransactionService({ repository: transactionRepository, clock });
const plaidWebhookService = new PlaidWebhookService({ bankingProvider, plaidItemRepository, jobQueue });

const app = createApp({
  database,
  authService,
  incomeService,
  expenseService,
  accountService,
  dashboardService,
  bankConnectionService,
  transactionService,
  plaidWebhookService,
  webOrigin: config.WEB_ORIGIN,
  sessionCookieSecure: config.SESSION_COOKIE_SECURE,
});

app.listen(config.PORT, () => {
  console.log(`[api] listening on port ${config.PORT}`);
});
