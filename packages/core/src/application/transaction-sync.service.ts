import type { AccountRepository } from '../ports/account-repository.js';
import type { BankingProvider } from '../ports/banking-provider.js';
import type { EncryptionService } from '../ports/encryption-service.js';
import type { PlaidItemRepository } from '../ports/plaid-item-repository.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';
import type { Clock } from '../ports/clock.js';

export interface TransactionSyncServiceDeps {
  bankingProvider: BankingProvider;
  plaidItemRepository: PlaidItemRepository;
  transactionRepository: TransactionRepository;
  accountRepository: AccountRepository;
  encryptionService: EncryptionService;
  clock: Clock;
}

export interface SyncJobInput {
  tenantId: string;
  plaidItemId: string;
}

/**
 * Runs inside the worker's poll loop, never inline in a webhook request.
 * Deliberately does NOT take an AuthContext — a worker-claimed background
 * job has no logged-in user, only the {tenantId, plaidItemId} the job
 * carries. Job lifecycle (complete/fail) is the caller's (worker's)
 * responsibility, not this service's — this only does the sync work.
 */
export class TransactionSyncService {
  constructor(private readonly deps: TransactionSyncServiceDeps) {}

  async processItem(job: SyncJobInput): Promise<void> {
    const item = await this.deps.plaidItemRepository.getById(job.tenantId, job.plaidItemId);

    if (!item || item.status === 'disconnected') {
      return; // stale job for an item that no longer wants syncing
    }

    const accessToken = await this.deps.encryptionService.decrypt(item.encryptedAccessToken);
    const accounts = await this.deps.accountRepository.list(job.tenantId);
    const accountIdByPlaidAccountId = new Map(
      accounts
        .filter((account) => account.plaidItemId === item.id && account.plaidAccountId)
        .map((account) => [account.plaidAccountId!, account.id]),
    );

    let cursor = item.cursor ?? null;

    try {
      for (;;) {
        const page = await this.deps.bankingProvider.syncTransactions(accessToken, cursor);
        const now = this.deps.clock.now().toISOString();

        for (const plaidTransaction of [...page.added, ...page.modified]) {
          const accountId = accountIdByPlaidAccountId.get(plaidTransaction.plaidAccountId);
          if (!accountId) {
            // An account added to the Plaid connection after initial
            // link — out of scope for this phase, skip it.
            continue;
          }

          await this.deps.transactionRepository.upsert({
            id: plaidTransaction.plaidTransactionId,
            tenantId: job.tenantId,
            accountId,
            plaidAccountId: plaidTransaction.plaidAccountId,
            amountMinorUnits: plaidTransaction.amountMinorUnits,
            currency: plaidTransaction.currency,
            description: plaidTransaction.description,
            merchantName: plaidTransaction.merchantName,
            date: plaidTransaction.date,
            pending: plaidTransaction.pending,
            createdAt: now,
            updatedAt: now,
          });
        }

        for (const removed of page.removed) {
          await this.deps.transactionRepository.remove(job.tenantId, removed.plaidTransactionId);
        }

        // The cursor only advances once this page's writes are fully
        // persisted — never before. If anything above throws, execution
        // never reaches here and item.cursor stays at its last-known-good
        // value, so a retry re-fetches the same page rather than skipping it.
        await this.deps.plaidItemRepository.updateCursor(job.tenantId, item.id, page.nextCursor, now);
        cursor = page.nextCursor;

        if (!page.hasMore) {
          break;
        }
      }
    } catch (error) {
      await this.deps.plaidItemRepository.markError(
        job.tenantId,
        item.id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
