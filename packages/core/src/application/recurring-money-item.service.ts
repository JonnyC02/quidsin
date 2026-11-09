import type { RecurringMoneyItem } from '../domain/entities/recurring-money-item.js';
import type { Frequency } from '../domain/entities/frequency.js';
import type { Visibility } from '../domain/entities/visibility.js';
import type { RecurringMoneyItemRepository } from '../ports/recurring-money-item-repository.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import { NotFoundError } from '../domain/errors.js';
import { canView } from '../domain/visibility-rules.js';
import type { AuthContext } from './auth-context.js';

export interface RecurringMoneyItemServiceDeps<T extends RecurringMoneyItem> {
  repository: RecurringMoneyItemRepository<T>;
  clock: Clock;
  idGenerator: IdGenerator;
}

export interface CreateRecurringMoneyItemInput {
  name: string;
  amountMinorUnits: number;
  frequency: Frequency;
  anchorDate: string;
  description?: string;
}

export interface UpdateRecurringMoneyItemInput {
  name?: string;
  amountMinorUnits?: number;
  frequency?: Frequency;
  anchorDate?: string;
  description?: string;
}

/**
 * Shared behavior for IncomeService and ExpenseService — they're
 * structurally identical in Phase 2. `getById` doubles as the ownership
 * check: a record that exists but belongs to someone else returns the same
 * NotFoundError as one that doesn't exist, to avoid leaking existence.
 */
export class RecurringMoneyItemService<T extends RecurringMoneyItem> {
  constructor(protected readonly deps: RecurringMoneyItemServiceDeps<T>) {}

  async create(ctx: AuthContext, input: CreateRecurringMoneyItemInput): Promise<T> {
    const now = this.deps.clock.now().toISOString();

    return this.deps.repository.create({
      id: this.deps.idGenerator.generate(),
      tenantId: ctx.tenantId,
      ownerId: ctx.userId,
      name: input.name,
      amountMinorUnits: input.amountMinorUnits,
      frequency: input.frequency,
      anchorDate: input.anchorDate,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(ctx: AuthContext, id: string, input: UpdateRecurringMoneyItemInput): Promise<T> {
    await this.getOwned(ctx, id);

    return this.deps.repository.update(ctx.tenantId, id, {
      ...input,
      updatedAt: this.deps.clock.now().toISOString(),
    });
  }

  async setActive(ctx: AuthContext, id: string, active: boolean): Promise<T> {
    await this.getOwned(ctx, id);
    return this.deps.repository.setActive(
      ctx.tenantId,
      id,
      active,
      this.deps.clock.now().toISOString(),
    );
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    await this.getOwned(ctx, id);
    await this.deps.repository.remove(ctx.tenantId, id);
  }

  /**
   * Not even the tenant Owner can change another member's record's
   * visibility — "private" is private, full stop. Only the record's own
   * owner can ever call this.
   */
  async setVisibility(
    ctx: AuthContext,
    id: string,
    visibility: Visibility,
    sharedWithUserIds?: string[],
  ): Promise<T> {
    await this.getOwned(ctx, id);

    return this.deps.repository.update(ctx.tenantId, id, {
      visibility,
      sharedWithUserIds: visibility === 'shared' ? sharedWithUserIds : undefined,
      updatedAt: this.deps.clock.now().toISOString(),
    });
  }

  async list(ctx: AuthContext): Promise<T[]> {
    const items = await this.deps.repository.list(ctx.tenantId);
    return items.filter((item) => canView(item, ctx));
  }

  /** A read — respects visibility, not strict ownership (a tenant/shared record is readable by others). */
  async getById(ctx: AuthContext, id: string): Promise<T> {
    const item = await this.deps.repository.getById(ctx.tenantId, id);

    if (!item || !canView(item, ctx)) {
      throw new NotFoundError();
    }

    return item;
  }

  /** Strict ownership — used internally to gate mutation, regardless of visibility. */
  private async getOwned(ctx: AuthContext, id: string): Promise<T> {
    const item = await this.deps.repository.getById(ctx.tenantId, id);

    if (!item || item.ownerId !== ctx.userId) {
      throw new NotFoundError();
    }

    return item;
  }
}
