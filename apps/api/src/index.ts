import { loadConfig } from '@quidsin/config';
import {
  createDocumentClient,
  createDynamoDbClient,
  DynamoDbLocalAdapter,
  DynamoAccountRepository,
  DynamoExpenseRepository,
  DynamoIncomeRepository,
  DynamoPasswordResetTokenRepository,
  DynamoSessionRepository,
  DynamoUserRepository,
  ensureTableExists,
} from '@quidsin/database';
import {
  AccountService,
  AuthService,
  DashboardService,
  ExpenseService,
  IncomeService,
  RandomUuidGenerator,
  SystemClock,
  type Notifier,
} from '@quidsin/core';
import { createApp } from './app.js';
import { Argon2PasswordHasher } from './infra/argon2-password-hasher.js';
import { ConsoleNotifier } from './infra/console-notifier.js';
import { SmtpNotifier } from './infra/smtp-notifier.js';

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
const passwordResetTokenRepository = new DynamoPasswordResetTokenRepository(docClient, tableName);
const incomeRepository = new DynamoIncomeRepository(docClient, tableName);
const expenseRepository = new DynamoExpenseRepository(docClient, tableName);
const accountRepository = new DynamoAccountRepository(docClient, tableName);

const clock = new SystemClock();
const idGenerator = new RandomUuidGenerator();

const notifier: Notifier =
  config.NOTIFIER_DRIVER === 'smtp'
    ? new SmtpNotifier({
        host: config.SMTP_HOST!,
        port: config.SMTP_PORT!,
        secure: config.SMTP_SECURE,
        user: config.SMTP_USER!,
        password: config.SMTP_PASSWORD!,
        fromAddress: config.SMTP_FROM_ADDRESS!,
      })
    : new ConsoleNotifier();

const authService = new AuthService({
  userRepository,
  sessionRepository,
  passwordResetTokenRepository,
  incomeRepository,
  expenseRepository,
  accountRepository,
  passwordHasher: new Argon2PasswordHasher(),
  notifier,
  clock,
  idGenerator,
  config: {
    sessionDurationHours: config.SESSION_DURATION_HOURS,
    passwordResetTokenTtlMinutes: config.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    passwordResetBaseUrl: config.PASSWORD_RESET_BASE_URL,
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

const app = createApp({
  database,
  authService,
  incomeService,
  expenseService,
  accountService,
  dashboardService,
  webOrigin: config.WEB_ORIGIN,
  sessionCookieSecure: config.SESSION_COOKIE_SECURE,
});

app.listen(config.PORT, () => {
  console.log(`[api] listening on port ${config.PORT}`);
});
