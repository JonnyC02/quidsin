import type {
  Account,
  AccountPatch,
  AccountRepository,
  BankingProvider,
  EncryptedPayload,
  EncryptionService,
  ExchangeResult,
  GoogleIdentity,
  GoogleIdentityVerifier,
  GoogleProfile,
  JobQueue,
  LinkTokenRequest,
  NewAccount,
  NewPlaidItem,
  NewRecurringMoneyItem,
  NewSession,
  NewTransaction,
  PlaidAccountInfo,
  PlaidItem,
  PlaidItemRepository,
  RecurringMoneyItem,
  RecurringMoneyItemPatch,
  RecurringMoneyItemRepository,
  Session,
  SessionRepository,
  SyncJob,
  SyncPage,
  Tenant,
  Transaction,
  TransactionFilter,
  TransactionRepository,
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
      isManual: account.isManual ?? true,
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

/** Stands in for real Plaid infrastructure — nothing in tests calls Plaid. */
export class FakeBankingProvider implements BankingProvider {
  readonly removedAccessTokens: string[] = [];
  private linkToken = 'fake-link-token';
  private readonly exchangeResultsByPublicToken = new Map<string, ExchangeResult>();
  private readonly accountsByAccessToken = new Map<string, PlaidAccountInfo[]>();
  private readonly syncPagesByAccessToken = new Map<string, SyncPage[]>();
  private readonly syncCallIndexByAccessToken = new Map<string, number>();
  private webhookSignatureValid = true;

  seedLinkToken(linkToken: string): void {
    this.linkToken = linkToken;
  }

  seedExchange(publicToken: string, result: ExchangeResult): void {
    this.exchangeResultsByPublicToken.set(publicToken, result);
  }

  seedAccounts(accessToken: string, accounts: PlaidAccountInfo[]): void {
    this.accountsByAccessToken.set(accessToken, accounts);
  }

  seedSyncPages(accessToken: string, pages: SyncPage[]): void {
    this.syncPagesByAccessToken.set(accessToken, [...pages]);
    this.syncCallIndexByAccessToken.set(accessToken, 0);
  }

  setWebhookSignatureValid(valid: boolean): void {
    this.webhookSignatureValid = valid;
  }

  async createLinkToken(_request: LinkTokenRequest): Promise<{ linkToken: string }> {
    return { linkToken: this.linkToken };
  }

  async exchangePublicToken(publicToken: string): Promise<ExchangeResult> {
    const result = this.exchangeResultsByPublicToken.get(publicToken);
    if (!result) {
      throw new Error(`FakeBankingProvider: no exchange result seeded for ${publicToken}`);
    }
    return result;
  }

  async getAccounts(accessToken: string): Promise<PlaidAccountInfo[]> {
    return this.accountsByAccessToken.get(accessToken) ?? [];
  }

  async syncTransactions(accessToken: string, _cursor: string | null): Promise<SyncPage> {
    const pages = this.syncPagesByAccessToken.get(accessToken) ?? [];
    const index = this.syncCallIndexByAccessToken.get(accessToken) ?? 0;
    const page = pages[index];
    if (!page) {
      throw new Error(`FakeBankingProvider: no sync page seeded for call #${index} on ${accessToken}`);
    }
    this.syncCallIndexByAccessToken.set(accessToken, index + 1);
    return page;
  }

  async removeItem(accessToken: string): Promise<void> {
    this.removedAccessTokens.push(accessToken);
  }

  async verifyWebhookSignature(): Promise<boolean> {
    return this.webhookSignatureValid;
  }
}

/** Trivially reversible — not real encryption; test-only. */
export class InMemoryEncryptionService implements EncryptionService {
  async encrypt(plaintext: string): Promise<EncryptedPayload> {
    return {
      ciphertext: Buffer.from(plaintext, 'utf8').toString('base64'),
      iv: 'fake-iv',
      authTag: 'fake-auth-tag',
    };
  }

  async decrypt(payload: EncryptedPayload): Promise<string> {
    return Buffer.from(payload.ciphertext, 'base64').toString('utf8');
  }
}

interface QueuedJob {
  tenantId: string;
  plaidItemId: string;
  attempts: number;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  visibleAt: number;
}

/** Implements the same dedup/lease semantics as the real DynamoDB-backed queue. */
export class InMemoryJobQueue implements JobQueue {
  private readonly jobsByPlaidItemId = new Map<string, QueuedJob>();

  async enqueueSync(job: { tenantId: string; plaidItemId: string }): Promise<void> {
    const existing = this.jobsByPlaidItemId.get(job.plaidItemId);
    if (existing && (existing.status === 'pending' || existing.status === 'in_progress')) {
      return;
    }
    this.jobsByPlaidItemId.set(job.plaidItemId, { ...job, attempts: 0, status: 'pending', visibleAt: 0 });
  }

  async claimNext(_workerId: string, leaseDurationMs: number): Promise<SyncJob | null> {
    const now = Date.now();
    for (const [id, job] of this.jobsByPlaidItemId) {
      const claimable = job.status === 'pending' || (job.status === 'in_progress' && job.visibleAt < now);
      if (claimable) {
        const claimed: QueuedJob = {
          ...job,
          status: 'in_progress',
          visibleAt: now + leaseDurationMs,
          attempts: job.attempts + 1,
        };
        this.jobsByPlaidItemId.set(id, claimed);
        return { tenantId: claimed.tenantId, plaidItemId: claimed.plaidItemId, attempts: claimed.attempts };
      }
    }
    return null;
  }

  async complete(plaidItemId: string): Promise<void> {
    const job = this.jobsByPlaidItemId.get(plaidItemId);
    if (job) {
      this.jobsByPlaidItemId.set(plaidItemId, { ...job, status: 'done' });
    }
  }

  async fail(plaidItemId: string, _error: string): Promise<void> {
    const job = this.jobsByPlaidItemId.get(plaidItemId);
    if (job) {
      this.jobsByPlaidItemId.set(plaidItemId, { ...job, status: 'failed' });
    }
  }
}

export class InMemoryPlaidItemRepository implements PlaidItemRepository {
  private readonly itemsById = new Map<string, PlaidItem>();

  async create(item: NewPlaidItem): Promise<PlaidItem> {
    const record: PlaidItem = { ...item, status: 'active' };
    this.itemsById.set(item.id, record);
    return record;
  }

  async updateCursor(tenantId: string, id: string, cursor: string, lastSyncedAt: string): Promise<void> {
    const item = this.itemsById.get(id);
    if (item && item.tenantId === tenantId) {
      this.itemsById.set(id, { ...item, cursor, lastSyncedAt });
    }
  }

  async markError(tenantId: string, id: string, error: string): Promise<void> {
    const item = this.itemsById.get(id);
    if (item && item.tenantId === tenantId) {
      this.itemsById.set(id, { ...item, status: 'error', lastError: error });
    }
  }

  async markDisconnected(tenantId: string, id: string): Promise<void> {
    const item = this.itemsById.get(id);
    if (item && item.tenantId === tenantId) {
      this.itemsById.set(id, { ...item, status: 'disconnected' });
    }
  }

  async getById(tenantId: string, id: string): Promise<PlaidItem | null> {
    const item = this.itemsById.get(id);
    return item && item.tenantId === tenantId ? item : null;
  }

  async findByPlaidItemId(plaidItemId: string): Promise<PlaidItem | null> {
    return this.itemsById.get(plaidItemId) ?? null;
  }

  async list(tenantId: string): Promise<PlaidItem[]> {
    return [...this.itemsById.values()].filter((item) => item.tenantId === tenantId);
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    for (const [id, item] of this.itemsById) {
      if (item.tenantId === tenantId) {
        this.itemsById.delete(id);
      }
    }
  }
}

export class InMemoryTransactionRepository implements TransactionRepository {
  private readonly transactionsById = new Map<string, Transaction>();

  async upsert(transaction: NewTransaction): Promise<Transaction> {
    const existing = this.transactionsById.get(transaction.id);
    const record: Transaction = { ...transaction, notes: existing?.notes };
    this.transactionsById.set(transaction.id, record);
    return record;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const transaction = this.transactionsById.get(id);
    if (transaction && transaction.tenantId === tenantId) {
      this.transactionsById.delete(id);
    }
  }

  async list(tenantId: string, filter?: TransactionFilter): Promise<Transaction[]> {
    let items = [...this.transactionsById.values()].filter((t) => t.tenantId === tenantId);

    if (filter?.accountId) {
      items = items.filter((t) => t.accountId === filter.accountId);
    }
    if (filter?.pending !== undefined) {
      items = items.filter((t) => t.pending === filter.pending);
    }
    if (filter?.startDate) {
      items = items.filter((t) => t.date >= filter.startDate!);
    }
    if (filter?.endDate) {
      items = items.filter((t) => t.date <= filter.endDate!);
    }
    if (filter?.search) {
      const query = filter.search.toLowerCase();
      items = items.filter(
        (t) =>
          t.description.toLowerCase().includes(query) ||
          (t.merchantName?.toLowerCase().includes(query) ?? false),
      );
    }

    return items;
  }

  async getById(tenantId: string, id: string): Promise<Transaction | null> {
    const transaction = this.transactionsById.get(id);
    return transaction && transaction.tenantId === tenantId ? transaction : null;
  }

  async updateNotes(tenantId: string, id: string, notes: string, updatedAt: string): Promise<Transaction> {
    const existing = this.transactionsById.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error('Not found in fake repository');
    }
    const updated = { ...existing, notes, updatedAt };
    this.transactionsById.set(id, updated);
    return updated;
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    for (const [id, transaction] of this.transactionsById) {
      if (transaction.tenantId === tenantId) {
        this.transactionsById.delete(id);
      }
    }
  }
}
