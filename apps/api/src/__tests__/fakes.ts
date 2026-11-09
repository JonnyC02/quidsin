import type {
  Account,
  AccountPatch,
  AccountRepository,
  GoogleIdentity,
  GoogleIdentityVerifier,
  GoogleProfile,
  NewAccount,
  NewRecurringMoneyItem,
  NewSession,
  RecurringMoneyItem,
  RecurringMoneyItemPatch,
  RecurringMoneyItemRepository,
  Session,
  SessionRepository,
  Tenant,
  User,
  UserRepository,
} from '@quidsin/core';

/**
 * Trimmed, route-test-only in-memory fakes. Deliberately not shared with
 * packages/core's own test fakes — those are internal to that package
 * (not part of its public exports) and reaching into another package's
 * __tests__ directory would be fragile. These exist purely to exercise
 * HTTP wiring (auth cookies, status codes, validation, tenant isolation
 * at the route layer), not to re-test business logic already covered in
 * packages/core's own unit tests.
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly usersByGoogleSub = new Map<string, User>();
  private readonly tenantsById = new Map<string, Tenant>();
  private nextTenantId = 1;

  async findById(id: string): Promise<User | null> {
    return this.usersByGoogleSub.get(id) ?? null;
  }

  async findOrCreateByGoogleProfile(
    profile: GoogleProfile,
  ): Promise<{ user: User; tenant: Tenant }> {
    const existing = this.usersByGoogleSub.get(profile.googleSub);
    if (existing) {
      const tenant = this.tenantsById.get(existing.tenantId)!;
      return { user: existing, tenant };
    }

    const tenantId = `tenant-${this.nextTenantId}`;
    this.nextTenantId += 1;

    const now = new Date().toISOString();
    const user: User = {
      id: profile.googleSub,
      email: profile.email,
      tenantId,
      name: profile.name,
      createdAt: now,
      updatedAt: now,
    };
    const tenant: Tenant = {
      id: tenantId,
      name: profile.name ?? profile.email,
      ownerId: user.id,
      createdAt: now,
    };

    this.usersByGoogleSub.set(user.id, user);
    this.tenantsById.set(tenantId, tenant);

    return { user, tenant };
  }

  async delete(userId: string, tenantId: string): Promise<void> {
    this.usersByGoogleSub.delete(userId);
    this.tenantsById.delete(tenantId);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

  async create(session: NewSession): Promise<Session> {
    this.sessions.set(session.id, { ...session });
    return { ...session };
  }

  async findById(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async touch(id: string, expiresAt: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      this.sessions.set(id, { ...session, expiresAt });
    }
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(id);
      }
    }
  }
}

/** Stands in for real Google infrastructure — nothing in tests calls Google. */
export class FakeGoogleIdentityVerifier implements GoogleIdentityVerifier {
  private readonly identitiesByToken = new Map<string, GoogleIdentity>();

  seed(token: string, identity: GoogleIdentity): void {
    this.identitiesByToken.set(token, identity);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    const identity = this.identitiesByToken.get(idToken);
    if (!identity) {
      throw new Error('unrecognized fake Google ID token');
    }
    return identity;
  }
}

export class InMemoryRecurringMoneyItemRepository<
  T extends RecurringMoneyItem,
> implements RecurringMoneyItemRepository<T> {
  private readonly items = new Map<string, T>();

  async create(item: NewRecurringMoneyItem): Promise<T> {
    const record = { ...item, visibility: 'private', active: true } as unknown as T;
    this.items.set(item.id, record);
    return record;
  }

  async update(tenantId: string, id: string, patch: RecurringMoneyItemPatch): Promise<T> {
    const existing = await this.getById(tenantId, id);
    if (!existing) {
      throw new Error('Not found in fake repository');
    }
    const updated = { ...existing, ...patch } as T;
    this.items.set(id, updated);
    return updated;
  }

  async setActive(tenantId: string, id: string, active: boolean, updatedAt: string): Promise<T> {
    const existing = await this.getById(tenantId, id);
    if (!existing) {
      throw new Error('Not found in fake repository');
    }
    const updated = { ...existing, active, updatedAt } as T;
    this.items.set(id, updated);
    return updated;
  }

  async remove(_tenantId: string, id: string): Promise<void> {
    this.items.delete(id);
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    for (const [id, item] of this.items) {
      if (item.tenantId === tenantId) {
        this.items.delete(id);
      }
    }
  }

  async list(tenantId: string): Promise<T[]> {
    return [...this.items.values()].filter((item) => item.tenantId === tenantId);
  }

  async getById(tenantId: string, id: string): Promise<T | null> {
    const item = this.items.get(id);
    return item && item.tenantId === tenantId ? item : null;
  }
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, Account>();

  async create(account: NewAccount): Promise<Account> {
    const record: Account = {
      ...account,
      visibility: 'private',
      isManual: true,
      balanceUpdatedAt: account.updatedAt,
    };
    this.accounts.set(account.id, record);
    return record;
  }

  async update(tenantId: string, id: string, patch: AccountPatch): Promise<Account> {
    const existing = await this.getById(tenantId, id);
    if (!existing) {
      throw new Error('Not found in fake repository');
    }
    const updated = { ...existing, ...patch };
    this.accounts.set(id, updated);
    return updated;
  }

  async updateBalance(
    tenantId: string,
    id: string,
    balanceMinorUnits: number,
    balanceUpdatedAt: string,
  ): Promise<Account> {
    const existing = await this.getById(tenantId, id);
    if (!existing) {
      throw new Error('Not found in fake repository');
    }
    const updated = { ...existing, balanceMinorUnits, balanceUpdatedAt };
    this.accounts.set(id, updated);
    return updated;
  }

  async remove(_tenantId: string, id: string): Promise<void> {
    this.accounts.delete(id);
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    for (const [id, account] of this.accounts) {
      if (account.tenantId === tenantId) {
        this.accounts.delete(id);
      }
    }
  }

  async list(tenantId: string): Promise<Account[]> {
    return [...this.accounts.values()].filter((account) => account.tenantId === tenantId);
  }

  async getById(tenantId: string, id: string): Promise<Account | null> {
    const account = this.accounts.get(id);
    return account && account.tenantId === tenantId ? account : null;
  }
}
