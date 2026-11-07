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
  type PasswordHasher,
} from '@quidsin/core';
import type { IncomeSource } from '@quidsin/core';
import type { RecurringExpense } from '@quidsin/core';
import { createApp } from '../app.js';
import {
  CapturingNotifier,
  InMemoryAccountRepository,
  InMemoryPasswordResetTokenRepository,
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

/** Fast, reversible — test-only, never used outside this file. */
class FakePasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    return `hashed:${plaintext}`;
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    return hash === `hashed:${plaintext}`;
  }
}

export function buildTestApp(options: { databaseHealthy?: boolean } = {}): {
  app: Express;
  notifier: CapturingNotifier;
} {
  const clock = new SystemClock();
  const idGenerator = new RandomUuidGenerator();
  const notifier = new CapturingNotifier();

  const userRepository = new InMemoryUserRepository();
  const sessionRepository = new InMemorySessionRepository();
  const passwordResetTokenRepository = new InMemoryPasswordResetTokenRepository();
  const incomeRepository = new InMemoryRecurringMoneyItemRepository<IncomeSource>();
  const expenseRepository = new InMemoryRecurringMoneyItemRepository<RecurringExpense>();
  const accountRepository = new InMemoryAccountRepository();

  const authService = new AuthService({
    userRepository,
    sessionRepository,
    passwordResetTokenRepository,
    incomeRepository,
    expenseRepository,
    accountRepository,
    passwordHasher: new FakePasswordHasher(),
    notifier,
    clock,
    idGenerator,
    config: {
      sessionDurationHours: 168,
      passwordResetTokenTtlMinutes: 60,
      passwordResetBaseUrl: 'http://localhost:5173/reset-password',
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

  return { app, notifier };
}
