import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { Config } from '@quidsin/config';
import {
  createDocumentClient,
  DynamoAccountRepository,
  DynamoAuditEventRepository,
  DynamoDbJobQueue,
  DynamoExpenseRepository,
  DynamoIncomeRepository,
  DynamoPlaidItemRepository,
  DynamoSessionRepository,
  DynamoTenantInviteRepository,
  DynamoTenantMembershipRepository,
  DynamoTenantRepository,
  DynamoTransactionRepository,
  DynamoUserRepository,
  type HealthCheckable,
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
  TenantMembershipService,
  TransactionService,
} from '@quidsin/core';
import { createPlaidClient, PlaidBankingProvider } from '@quidsin/banking';
import type { Express } from 'express';
import { createApp } from './app.js';
import { GoogleAuthLibraryIdentityVerifier } from './infra/google-identity-verifier.js';

export interface BuildApiAppDeps {
  database: HealthCheckable;
  dynamoClient: DynamoDBClient;
}

/**
 * Everything the API needs, built from an already-constructed DynamoDB
 * client and health-check adapter — the only two things that differ
 * between the self-hosted entrypoint (src/index.ts, local creds/endpoint,
 * calls ensureTableExists first) and the Lambda entrypoint (src/lambda.ts,
 * execution-role creds, a CloudFormation-managed table). This function
 * never calls ensureTableExists itself; that stays the self-hosted
 * entrypoint's responsibility, run before this is called.
 */
export async function buildApiApp(config: Config, deps: BuildApiAppDeps): Promise<{ app: Express }> {
  const docClient = createDocumentClient(deps.dynamoClient);
  const tableName = config.DYNAMODB_TABLE_NAME;

  const userRepository = new DynamoUserRepository(docClient, tableName);
  const tenantRepository = new DynamoTenantRepository(docClient, tableName);
  const sessionRepository = new DynamoSessionRepository(docClient, tableName);
  const incomeRepository = new DynamoIncomeRepository(docClient, tableName);
  const expenseRepository = new DynamoExpenseRepository(docClient, tableName);
  const accountRepository = new DynamoAccountRepository(docClient, tableName);
  const plaidItemRepository = new DynamoPlaidItemRepository(docClient, tableName);
  const transactionRepository = new DynamoTransactionRepository(docClient, tableName);
  const jobQueue = new DynamoDbJobQueue(docClient, tableName);
  const tenantMembershipRepository = new DynamoTenantMembershipRepository(docClient, tableName);
  const tenantInviteRepository = new DynamoTenantInviteRepository(docClient, tableName);
  const auditEventRepository = new DynamoAuditEventRepository(docClient, tableName);

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
    tenantMembershipRepository,
    tenantInviteRepository,
    auditEventRepository,
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
  const transactionService = new TransactionService({
    repository: transactionRepository,
    accountRepository,
    clock,
  });
  const plaidWebhookService = new PlaidWebhookService({ bankingProvider, plaidItemRepository, jobQueue });
  const tenantMembershipService = new TenantMembershipService({
    tenantMembershipRepository,
    tenantInviteRepository,
    auditEventRepository,
    userRepository,
    tenantRepository,
    sessionRepository,
    clock,
    idGenerator,
  });

  const app = createApp({
    database: deps.database,
    authService,
    incomeService,
    expenseService,
    accountService,
    dashboardService,
    bankConnectionService,
    transactionService,
    plaidWebhookService,
    tenantMembershipService,
    tenantRepository,
    webOrigin: config.WEB_ORIGIN,
    sessionCookieSecure: config.SESSION_COOKIE_SECURE,
  });

  return { app };
}
