import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { HealthCheckable } from '@quidsin/database';
import type { HealthStatus } from '@quidsin/shared';
import type {
  AccountService,
  AuthService,
  BankConnectionService,
  DashboardService,
  ExpenseService,
  IncomeService,
  PlaidWebhookService,
  TransactionService,
} from '@quidsin/core';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createRecurringMoneyItemRoutes } from './routes/recurring-money-item.routes.js';
import { createAccountRoutes } from './routes/account.routes.js';
import { createDashboardRoutes } from './routes/dashboard.routes.js';
import { createPlaidRoutes } from './routes/plaid.routes.js';
import { createPlaidWebhookRoutes } from './routes/plaid-webhook.routes.js';
import { createTransactionRoutes } from './routes/transaction.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export interface AppDeps {
  database: HealthCheckable;
  authService: AuthService;
  incomeService: IncomeService;
  expenseService: ExpenseService;
  accountService: AccountService;
  dashboardService: DashboardService;
  bankConnectionService: BankConnectionService;
  transactionService: TransactionService;
  plaidWebhookService: PlaidWebhookService;
  webOrigin: string;
  sessionCookieSecure: boolean;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(cors({ origin: deps.webOrigin, credentials: true }));

  // Mounted before the app-wide express.json() below — it needs the raw,
  // unparsed request body to verify Plaid's webhook signature, and a
  // request stream can only be read once.
  app.use('/plaid/webhook', createPlaidWebhookRoutes(deps.plaidWebhookService));

  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    const body: HealthStatus = {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await deps.database.ping();
      const body: HealthStatus = {
        status: 'ok',
        uptimeSeconds: process.uptime(),
        timestamp: new Date().toISOString(),
      };
      res.json(body);
    } catch {
      const body: HealthStatus = {
        status: 'error',
        uptimeSeconds: process.uptime(),
        timestamp: new Date().toISOString(),
      };
      res.status(503).json(body);
    }
  });

  app.use(
    '/auth',
    createAuthRoutes({
      authService: deps.authService,
      sessionCookieSecure: deps.sessionCookieSecure,
    }),
  );
  app.use('/income', createRecurringMoneyItemRoutes(deps.incomeService, deps.authService));
  app.use('/expenses', createRecurringMoneyItemRoutes(deps.expenseService, deps.authService));
  app.use('/accounts', createAccountRoutes(deps.accountService, deps.authService));
  app.use('/dashboard', createDashboardRoutes(deps.dashboardService, deps.authService));
  app.use('/plaid', createPlaidRoutes(deps.bankConnectionService, deps.authService));
  app.use('/transactions', createTransactionRoutes(deps.transactionService, deps.authService));

  app.use(errorHandler);

  return app;
}
