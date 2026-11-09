import type { Express } from 'express';
import type { HealthCheckable } from '@quidsin/database';
import {
  AccountService,
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
import type { IncomeSource } from '@quidsin/core';
import type { RecurringExpense } from '@quidsin/core';
import { createApp } from '../app.js';
import {
  FakeBankingProvider,
  FakeGoogleIdentityVerifier,
  InMemoryAccountRepository,
  InMemoryEncryptionService,
  InMemoryJobQueue,
  InMemoryPlaidItemRepository,
  InMemoryRecurringMoneyItemRepository,
  InMemorySessionRepository,
  InMemoryTransactionRepository,
  InMemoryUserRepository,
} from './fakes.js';

class FakeDatabase implements HealthCheckable {
  constructor(private readonly healthy: boolean) {}

  async ping(): Promise<boolean> {
    if (!this.healthy) {
      throw new Error('unreachable');
    }
    return true;
  }
}

export function buildTestApp(options: { databaseHealthy?: boolean } = {}): {
  app: Express;
  googleIdentityVerifier: FakeGoogleIdentityVerifier;
  bankingProvider: FakeBankingProvider;
} {
  const clock = new SystemClock();
  const idGenerator = new RandomUuidGenerator();
  const googleIdentityVerifier = new FakeGoogleIdentityVerifier();
  const bankingProvider = new FakeBankingProvider();

  const userRepository = new InMemoryUserRepository();
  const sessionRepository = new InMemorySessionRepository();
  const incomeRepository = new InMemoryRecurringMoneyItemRepository<IncomeSource>();
  const expenseRepository = new InMemoryRecurringMoneyItemRepository<RecurringExpense>();
  const accountRepository = new InMemoryAccountRepository();
  const plaidItemRepository = new InMemoryPlaidItemRepository();
  const transactionRepository = new InMemoryTransactionRepository();
  const jobQueue = new InMemoryJobQueue();
  const encryptionService = new InMemoryEncryptionService();

  const authService = new AuthService({
    userRepository,
    sessionRepository,
    googleIdentityVerifier,
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
      sessionDurationHours: 168,
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
    config: {},
  });
  const transactionService = new TransactionService({ repository: transactionRepository, clock });
  const plaidWebhookService = new PlaidWebhookService({ bankingProvider, plaidItemRepository, jobQueue });

  const app = createApp({
    database: new FakeDatabase(options.databaseHealthy ?? true),
    authService,
    incomeService,
    expenseService,
    accountService,
    dashboardService,
    bankConnectionService,
    transactionService,
    plaidWebhookService,
    webOrigin: 'http://localhost:5173',
    sessionCookieSecure: false,
  });

  return { app, googleIdentityVerifier, bankingProvider };
}
