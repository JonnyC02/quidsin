import type { Account, AccountType } from '../domain/entities/account.js';
import type { PlaidItem } from '../domain/entities/plaid-item.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { BankingProvider } from '../ports/banking-provider.js';
import type { EncryptionService } from '../ports/encryption-service.js';
import type { JobQueue } from '../ports/job-queue.js';
import type { PlaidItemRepository } from '../ports/plaid-item-repository.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import { NotFoundError } from '../domain/errors.js';
import type { AuthContext } from './auth-context.js';

export interface BankConnectionServiceConfig {
  /** Absent in local/self-hosted dev without a public URL — Link is then created without a webhook. */
  webhookUrl?: string;
}

export interface BankConnectionServiceDeps {
  bankingProvider: BankingProvider;
  plaidItemRepository: PlaidItemRepository;
  accountRepository: AccountRepository;
  jobQueue: JobQueue;
  encryptionService: EncryptionService;
  clock: Clock;
  idGenerator: IdGenerator;
  config: BankConnectionServiceConfig;
}

/** Best-effort, approximate mapping — Plaid's exact subtype taxonomy varies by institution/region. */
function mapPlaidAccountType(plaidType: string, plaidSubtype: string | undefined): AccountType {
  if (plaidType === 'credit') {
    return 'credit_card';
  }
  if (plaidType === 'depository') {
    return plaidSubtype === 'savings' ? 'savings' : 'current';
  }
  if (plaidType === 'investment') {
    return plaidSubtype === 'isa' ? 'isa_stocks_and_shares' : 'other';
  }
  return 'other';
}

export class BankConnectionService {
  constructor(private readonly deps: BankConnectionServiceDeps) {}

  async createLinkToken(ctx: AuthContext): Promise<{ linkToken: string }> {
    return this.deps.bankingProvider.createLinkToken({
      userId: ctx.userId,
      webhookUrl: this.deps.config.webhookUrl,
    });
  }

  async exchangePublicToken(ctx: AuthContext, publicToken: string): Promise<{ accounts: Account[] }> {
    const exchange = await this.deps.bankingProvider.exchangePublicToken(publicToken);
    const encryptedAccessToken = await this.deps.encryptionService.encrypt(exchange.accessToken);
    const now = this.deps.clock.now().toISOString();

    await this.deps.plaidItemRepository.create({
      id: exchange.plaidItemId,
      tenantId: ctx.tenantId,
      ownerId: ctx.userId,
      institutionId: exchange.institutionId,
      institutionName: exchange.institutionName,
      encryptedAccessToken,
      createdAt: now,
      updatedAt: now,
    });

    // Server-side truth — never trust the frontend Link callback's
    // metadata for anything beyond immediate UX feedback.
    const plaidAccounts = await this.deps.bankingProvider.getAccounts(exchange.accessToken);

    const accounts: Account[] = [];
    for (const plaidAccount of plaidAccounts) {
      const account = await this.deps.accountRepository.create({
        id: this.deps.idGenerator.generate(),
        tenantId: ctx.tenantId,
        ownerId: ctx.userId,
        name: plaidAccount.name,
        type: mapPlaidAccountType(plaidAccount.type, plaidAccount.subtype),
        institutionName: exchange.institutionName,
        currency: plaidAccount.currency,
        balanceMinorUnits: plaidAccount.balanceMinorUnits,
        isManual: false,
        plaidItemId: exchange.plaidItemId,
        plaidAccountId: plaidAccount.plaidAccountId,
        createdAt: now,
        updatedAt: now,
      });
      accounts.push(account);
    }

    await this.deps.jobQueue.enqueueSync({ tenantId: ctx.tenantId, plaidItemId: exchange.plaidItemId });

    return { accounts };
  }

  async disconnectItem(ctx: AuthContext, plaidItemId: string): Promise<void> {
    const item = await this.getOwnedItem(ctx, plaidItemId);

    try {
      const accessToken = await this.deps.encryptionService.decrypt(item.encryptedAccessToken);
      await this.deps.bankingProvider.removeItem(accessToken);
    } catch (error) {
      // Best-effort — never block disconnect on Plaid's API being
      // unavailable; the item is still marked disconnected below. Only
      // the item id is logged, never the decrypted token.
      console.error(
        `[bank-connection] Failed to revoke Plaid item ${plaidItemId}:`,
        error instanceof Error ? error.message : error,
      );
    }

    await this.deps.plaidItemRepository.markDisconnected(ctx.tenantId, plaidItemId);
  }

  /** The self-hosted "Sync now" button — works without a public webhook URL. */
  async triggerSync(ctx: AuthContext, plaidItemId: string): Promise<void> {
    await this.getOwnedItem(ctx, plaidItemId);
    await this.deps.jobQueue.enqueueSync({ tenantId: ctx.tenantId, plaidItemId });
  }

  private async getOwnedItem(ctx: AuthContext, plaidItemId: string): Promise<PlaidItem> {
    const item = await this.deps.plaidItemRepository.getById(ctx.tenantId, plaidItemId);
    if (!item || item.ownerId !== ctx.userId) {
      throw new NotFoundError();
    }
    return item;
  }
}
