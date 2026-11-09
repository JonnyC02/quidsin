import { PlaidClient, PlaidEnvironment } from 'plaid';

export interface PlaidClientConfig {
  clientId: string;
  secret: string;
  /** Plaid dropped the separate "development" environment in 2023 — only sandbox and production remain. */
  environment: 'sandbox' | 'production';
}

export function createPlaidClient(config: PlaidClientConfig): PlaidClient {
  return new PlaidClient({
    environment: config.environment === 'production' ? PlaidEnvironment.Production : PlaidEnvironment.Sandbox,
    clientId: config.clientId,
    secret: config.secret,
  });
}
