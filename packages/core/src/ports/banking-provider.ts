export interface LinkTokenRequest {
  userId: string;
  webhookUrl?: string;
}

export interface PlaidAccountInfo {
  plaidAccountId: string;
  name: string;
  officialName?: string;
  mask?: string;
  type: string;
  subtype?: string;
  balanceMinorUnits: number;
  currency: string;
}

export interface ExchangeResult {
  accessToken: string;
  plaidItemId: string;
  institutionId?: string;
  institutionName?: string;
}

export interface PlaidTransactionData {
  plaidTransactionId: string;
  plaidAccountId: string;
  amountMinorUnits: number;
  currency: string;
  description: string;
  merchantName?: string;
  date: string;
  pending: boolean;
}

export interface SyncPage {
  added: PlaidTransactionData[];
  modified: PlaidTransactionData[];
  removed: { plaidTransactionId: string }[];
  nextCursor: string;
  hasMore: boolean;
}

/**
 * Implemented by packages/banking's real Plaid SDK adapter — this port is
 * the only thing packages/core knows about banking integration.
 */
export interface BankingProvider {
  createLinkToken(request: LinkTokenRequest): Promise<{ linkToken: string }>;
  exchangePublicToken(publicToken: string): Promise<ExchangeResult>;
  getAccounts(accessToken: string): Promise<PlaidAccountInfo[]>;
  /**
   * Returns one page per call — the caller (TransactionSyncService) drives
   * the `hasMore` loop, so "never advance the cursor before the page is
   * processed" stays an obvious caller-side responsibility rather than
   * something buried in the adapter.
   */
  syncTransactions(accessToken: string, cursor: string | null): Promise<SyncPage>;
  removeItem(accessToken: string): Promise<void>;
  verifyWebhookSignature(rawBody: string, jwtHeader: string | undefined): Promise<boolean>;
}
