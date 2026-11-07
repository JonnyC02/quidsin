import type {
  Account,
  AccountPatch,
  AccountRepository,
  Clock,
  IdGenerator,
  NewAccount,
  NewPasswordResetToken,
  NewRecurringMoneyItem,
  NewSession,
  Notifier,
  PasswordHasher,
  PasswordResetToken,
  PasswordResetTokenRepository,
  RecurringMoneyItem,
  RecurringMoneyItemPatch,
  RecurringMoneyItemRepository,
  RegisterUserInput,
  SendPasswordResetEmailInput,
  Session,
  SessionRepository,
  Tenant,
  User,
  UserRepository,
} from '../index.js';
import { ConflictError } from '../index.js';

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  set(date: Date): void {
    this.current = date;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

/** Not a real hash — reversible, fast, deterministic; test-only. */
export class FakePasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    return `hashed:${plaintext}`;
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    return hash === `hashed:${plaintext}`;
  }
}

export class CapturingNotifier implements Notifier {
  readonly sentEmails: SendPasswordResetEmailInput[] = [];

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
    this.sentEmails.push(input);
  }
}

export class InMemoryUserRepository implements UserRepository {
  private readonly usersById = new Map<string, User>();
  private readonly userIdByEmail = new Map<string, string>();
  private readonly tenantsById = new Map<string, Tenant>();
  private nextId = 1;

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const userId = this.userIdByEmail.get(email);
    return userId ? (this.usersById.get(userId) ?? null) : null;
  }

  async register(input: RegisterUserInput): Promise<{ user: User; tenant: Tenant }> {
    if (this.userIdByEmail.has(input.email)) {
      throw new ConflictError('Email already registered');
    }

    const userId = `user-${this.nextId}`;
    const tenantId = `tenant-${this.nextId}`;
    this.nextId += 1;

    const now = new Date().toISOString();
    const user: User = {
      id: userId,
      email: input.email,
      passwordHash: input.passwordHash,
      tenantId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    const tenant: Tenant = {
      id: tenantId,
      name: input.name ?? input.email,
      ownerId: userId,
      createdAt: now,
    };

    this.usersById.set(userId, user);
    this.userIdByEmail.set(input.email, userId);
    this.tenantsById.set(tenantId, tenant);

    return { user, tenant };
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    const user = this.usersById.get(userId);
    if (user) {
      this.usersById.set(userId, { ...user, passwordHash });
    }
  }

  async delete(userId: string, tenantId: string): Promise<void> {
    const user = this.usersById.get(userId);
    if (user) {
      this.userIdByEmail.delete(user.email);
    }
    this.usersById.delete(userId);
    this.tenantsById.delete(tenantId);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

  async create(session: NewSession): Promise<Session> {
    const record: Session = { ...session };
    this.sessions.set(record.id, record);
    return record;
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

export class InMemoryPasswordResetTokenRepository implements PasswordResetTokenRepository {
  private readonly tokens = new Map<string, PasswordResetToken>();

  async create(token: NewPasswordResetToken): Promise<PasswordResetToken> {
    const record: PasswordResetToken = { ...token, used: false };
    this.tokens.set(record.id, record);
    return record;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    for (const token of this.tokens.values()) {
      if (token.tokenHash === tokenHash) {
        return token;
      }
    }
    return null;
  }

  async markUsed(tokenHash: string): Promise<void> {
    for (const [id, token] of this.tokens) {
      if (token.tokenHash === tokenHash) {
        this.tokens.set(id, { ...token, used: true });
      }
    }
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const [id, token] of this.tokens) {
      if (token.userId === userId) {
        this.tokens.delete(id);
      }
    }
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
