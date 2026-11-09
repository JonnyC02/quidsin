import type { Express } from 'express';
import type { HealthCheckable } from '@quidsin/database';
import {
  AccountService,
  AuthService,
  DashboardService,
  ExpenseService,
  IncomeService,
  RandomUuidGenerator,
  SystemClock,
} from '@quidsin/core';
import type { IncomeSource } from '@quidsin/core';
import type { RecurringExpense } from '@quidsin/core';
import { createApp } from '../app.js';
import {
  FakeGoogleIdentityVerifier,
  InMemoryAccountRepository,
  InMemoryRecurringMoneyItemRepository,
  InMemorySessionRepository,
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
} {
  const clock = new SystemClock();
  const idGenerator = new RandomUuidGenerator();
  const googleIdentityVerifier = new FakeGoogleIdentityVerifier();

  const userRepository = new InMemoryUserRepository();
  const sessionRepository = new InMemorySessionRepository();
  const incomeRepository = new InMemoryRecurringMoneyItemRepository<IncomeSource>();
  const expenseRepository = new InMemoryRecurringMoneyItemRepository<RecurringExpense>();
  const accountRepository = new InMemoryAccountRepository();

  const authService = new AuthService({
    userRepository,
    sessionRepository,
    googleIdentityVerifier,
    incomeRepository,
    expenseRepository,
    accountRepository,
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

  const app = createApp({
    database: new FakeDatabase(options.databaseHealthy ?? true),
    authService,
    incomeService,
    expenseService,
    accountService,
    dashboardService,
    webOrigin: 'http://localhost:5173',
    sessionCookieSecure: false,
  });

  return { app, googleIdentityVerifier };
}
