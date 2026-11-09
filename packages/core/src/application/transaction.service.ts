import type { Transaction } from '../domain/entities/transaction.js';
import type { TransactionFilter, TransactionRepository } from '../ports/transaction-repository.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { Clock } from '../ports/clock.js';
import { NotFoundError } from '../domain/errors.js';
import { canView } from '../domain/visibility-rules.js';
import type { AuthContext } from './auth-context.js';

export interface TransactionServiceDeps {
  repository: TransactionRepository;
  accountRepository: AccountRepository;
  clock: Clock;
}

export class TransactionService {
  constructor(private readonly deps: TransactionServiceDeps) {}

  /**
   * A transaction carries no visibility of its own — it inherits its
   * owning account's. If you can't see the account, you can't see its
   * transactions.
   */
  async list(ctx: AuthContext, filter?: TransactionFilter): Promise<Transaction[]> {
    const visibleAccountIds = await this.visibleAccountIds(ctx);

    if (filter?.accountId) {
      return visibleAccountIds.has(filter.accountId)
        ? this.deps.repository.list(ctx.tenantId, filter)
        : [];
    }

    const transactions = await this.deps.repository.list(ctx.tenantId, filter);
    return transactions.filter((transaction) => visibleAccountIds.has(transaction.accountId));
  }

  /** Editing notes requires owning the transaction's account — broader "can view" access isn't enough to mutate. */
  async updateNotes(ctx: AuthContext, id: string, notes: string): Promise<Transaction> {
    const existing = await this.deps.repository.getById(ctx.tenantId, id);
    if (!existing) {
      throw new NotFoundError();
    }

    const account = await this.deps.accountRepository.getById(ctx.tenantId, existing.accountId);
    if (!account || account.ownerId !== ctx.userId) {
      throw new NotFoundError();
    }

    return this.deps.repository.updateNotes(ctx.tenantId, id, notes, this.deps.clock.now().toISOString());
  }

  private async visibleAccountIds(ctx: AuthContext): Promise<Set<string>> {
    const accounts = await this.deps.accountRepository.list(ctx.tenantId);
    return new Set(accounts.filter((account) => canView(account, ctx)).map((account) => account.id));
  }
}
