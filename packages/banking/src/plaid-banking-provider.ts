import { createHash } from 'node:crypto';
import type { PlaidClient } from 'plaid';
import { Plaid } from 'plaid';
import * as jose from 'jose';
import type {
  BankingProvider,
  ExchangeResult,
  LinkTokenRequest,
  PlaidAccountInfo,
  PlaidTransactionData,
  SyncPage,
} from '@quidsin/core';

export interface PlaidBankingProviderConfig {
  clientName: string;
  countryCodes: string[];
}

/** Plaid amounts are floats in major currency units — convert to integer minor units. */
function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

function toTransactionData(transaction: {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
  name: string;
  merchant_name?: string | null;
  date: string;
  pending: boolean;
}): PlaidTransactionData {
  return {
    plaidTransactionId: transaction.transaction_id,
    plaidAccountId: transaction.account_id,
    amountMinorUnits: toMinorUnits(transaction.amount),
    currency: transaction.iso_currency_code ?? transaction.unofficial_currency_code ?? 'USD',
    description: transaction.name,
    merchantName: transaction.merchant_name ?? undefined,
    date: transaction.date,
    pending: transaction.pending,
  };
}

export class PlaidBankingProvider implements BankingProvider {
  constructor(
    private readonly client: PlaidClient,
    private readonly config: PlaidBankingProviderConfig,
  ) {}

  async createLinkToken(request: LinkTokenRequest): Promise<{ linkToken: string }> {
    const response = await this.client.link.createToken({
      client_name: this.config.clientName,
      language: 'en',
      country_codes: this.config.countryCodes as Plaid.CountryCode[],
      user: { client_user_id: request.userId },
      products: [Plaid.Products.Transactions],
      webhook: request.webhookUrl,
    });

    return { linkToken: response.link_token };
  }

  async exchangePublicToken(publicToken: string): Promise<ExchangeResult> {
    const exchange = await this.client.item.exchangePublicToken({ public_token: publicToken });

    // The exchange response carries no institution info — a follow-up
    // `/item/get` call does.
    const itemInfo = await this.client.item.get({ access_token: exchange.access_token });

    return {
      accessToken: exchange.access_token,
      plaidItemId: exchange.item_id,
      institutionId: itemInfo.item.institution_id ?? undefined,
      institutionName: itemInfo.item.institution_name ?? undefined,
    };
  }

  async getAccounts(accessToken: string): Promise<PlaidAccountInfo[]> {
    const response = await this.client.accounts.get({ access_token: accessToken });

    return response.accounts.map((account) => ({
      plaidAccountId: account.account_id,
      name: account.name,
      officialName: account.official_name ?? undefined,
      mask: account.mask ?? undefined,
      type: account.type,
      subtype: account.subtype ?? undefined,
      balanceMinorUnits: toMinorUnits(account.balances.current ?? account.balances.available ?? 0),
      currency: account.balances.iso_currency_code ?? account.balances.unofficial_currency_code ?? 'USD',
    }));
  }

  async syncTransactions(accessToken: string, cursor: string | null): Promise<SyncPage> {
    const response = await this.client.transactions.sync({
      access_token: accessToken,
      cursor: cursor ?? undefined,
    });

    return {
      added: response.added.map(toTransactionData),
      modified: response.modified.map(toTransactionData),
      removed: response.removed.map((transaction) => ({ plaidTransactionId: transaction.transaction_id })),
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  async removeItem(accessToken: string): Promise<void> {
    await this.client.item.remove({ access_token: accessToken });
  }

  /**
   * Plaid signs webhooks as an ES256 JWT in the `Plaid-Verification` header.
   * We fetch the current verification key by its `kid`, then check both the
   * signature and that the JWT's `request_body_sha256` claim matches the
   * actual raw body — the signature alone doesn't prove the body wasn't
   * swapped for a different, also-validly-signed payload.
   */
  async verifyWebhookSignature(rawBody: string, jwtHeader: string | undefined): Promise<boolean> {
    if (!jwtHeader) {
      return false;
    }

    try {
      const { kid } = jose.decodeProtectedHeader(jwtHeader);
      if (!kid) {
        return false;
      }

      const { key } = await this.client.webhook.getVerificationKey({ key_id: kid });
      if (key.expired_at !== null && key.expired_at < Math.floor(Date.now() / 1000)) {
        return false;
      }

      const publicKey = await jose.importJWK(key, 'ES256');
      const { payload } = await jose.jwtVerify(jwtHeader, publicKey);

      const actualBodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
      return payload.request_body_sha256 === actualBodyHash;
    } catch {
      return false;
    }
  }
}
