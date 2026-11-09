import type { Account, AccountType } from '../domain/entities/account.js';
import type { Visibility } from '../domain/entities/visibility.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import { NotFoundError } from '../domain/errors.js';
import { canView } from '../domain/visibility-rules.js';
import type { AuthContext } from './auth-context.js';

export interface AccountServiceDeps {
  repository: AccountRepository;
  clock: Clock;
  idGenerator: IdGenerator;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  institutionName?: string;
  currency: string;
  balanceMinorUnits: number;
  description?: string;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccountType;
  institutionName?: string;
  currency?: string;
  description?: string;
}

export class AccountService {
  constructor(private readonly deps: AccountServiceDeps) {}

  async create(ctx: AuthContext, input: CreateAccountInput): Promise<Account> {
    const now = this.deps.clock.now().toISOString();

    return this.deps.repository.create({
      id: this.deps.idGenerator.generate(),
      tenantId: ctx.tenantId,
      ownerId: ctx.userId,
      name: input.name,
      type: input.type,
      institutionName: input.institutionName,
      currency: input.currency,
      balanceMinorUnits: input.balanceMinorUnits,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(ctx: AuthContext, id: string, input: UpdateAccountInput): Promise<Account> {
    await this.getOwned(ctx, id);

    return this.deps.repository.update(ctx.tenantId, id, {
      ...input,
      updatedAt: this.deps.clock.now().toISOString(),
    });
  }

  async updateBalance(ctx: AuthContext, id: string, balanceMinorUnits: number): Promise<Account> {
    await this.getOwned(ctx, id);

    return this.deps.repository.updateBalance(
      ctx.tenantId,
      id,
      balanceMinorUnits,
      this.deps.clock.now().toISOString(),
    );
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    await this.getOwned(ctx, id);
    await this.deps.repository.remove(ctx.tenantId, id);
  }

  /** Not even the tenant Owner can change another member's account's visibility. */
  async setVisibility(
    ctx: AuthContext,
    id: string,
    visibility: Visibility,
    sharedWithUserIds?: string[],
  ): Promise<Account> {
    await this.getOwned(ctx, id);

    return this.deps.repository.update(ctx.tenantId, id, {
      visibility,
      sharedWithUserIds: visibility === 'shared' ? sharedWithUserIds : undefined,
      updatedAt: this.deps.clock.now().toISOString(),
    });
  }

  async list(ctx: AuthContext): Promise<Account[]> {
    const accounts = await this.deps.repository.list(ctx.tenantId);
    return accounts.filter((account) => canView(account, ctx));
  }

  /** A read — respects visibility, not strict ownership. */
  async getById(ctx: AuthContext, id: string): Promise<Account> {
    const account = await this.deps.repository.getById(ctx.tenantId, id);

    if (!account || !canView(account, ctx)) {
      throw new NotFoundError();
    }

    return account;
  }

  /** Strict ownership — used internally to gate mutation, regardless of visibility. */
  private async getOwned(ctx: AuthContext, id: string): Promise<Account> {
    const account = await this.deps.repository.getById(ctx.tenantId, id);

    if (!account || account.ownerId !== ctx.userId) {
      throw new NotFoundError();
    }

    return account;
  }
}
