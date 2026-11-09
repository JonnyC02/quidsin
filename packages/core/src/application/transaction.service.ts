import type { Transaction } from '../domain/entities/transaction.js';
import type { TransactionFilter, TransactionRepository } from '../ports/transaction-repository.js';
import type { Clock } from '../ports/clock.js';
import { NotFoundError } from '../domain/errors.js';
import type { AuthContext } from './auth-context.js';

export interface TransactionServiceDeps {
  repository: TransactionRepository;
  clock: Clock;
}

export class TransactionService {
  constructor(private readonly deps: TransactionServiceDeps) {}

  async list(ctx: AuthContext, filter?: TransactionFilter): Promise<Transaction[]> {
    return this.deps.repository.list(ctx.tenantId, filter);
  }

  async updateNotes(ctx: AuthContext, id: string, notes: string): Promise<Transaction> {
    const existing = await this.deps.repository.getById(ctx.tenantId, id);
    if (!existing) {
      throw new NotFoundError();
    }

    return this.deps.repository.updateNotes(ctx.tenantId, id, notes, this.deps.clock.now().toISOString());
  }
}
