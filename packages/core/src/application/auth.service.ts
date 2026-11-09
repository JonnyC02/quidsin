import type { User } from '../domain/entities/user.js';
import type { Tenant } from '../domain/entities/tenant.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { SessionRepository } from '../ports/session-repository.js';
import type { IncomeRepository } from '../ports/income-repository.js';
import type { ExpenseRepository } from '../ports/expense-repository.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { GoogleIdentityVerifier } from '../ports/google-identity.js';
import type { BankingProvider } from '../ports/banking-provider.js';
import type { EncryptionService } from '../ports/encryption-service.js';
import type { PlaidItemRepository } from '../ports/plaid-item-repository.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { AuthContext } from './auth-context.js';
import { InvalidCredentialsError } from '../domain/errors.js';

export interface AuthServiceConfig {
  sessionDurationHours: number;
}

export interface AuthServiceDeps {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  googleIdentityVerifier: GoogleIdentityVerifier;
  incomeRepository: IncomeRepository;
  expenseRepository: ExpenseRepository;
  accountRepository: AccountRepository;
  plaidItemRepository: PlaidItemRepository;
  transactionRepository: TransactionRepository;
  bankingProvider: BankingProvider;
  encryptionService: EncryptionService;
  clock: Clock;
  idGenerator: IdGenerator;
  config: AuthServiceConfig;
}

export interface SessionIssued {
  sessionId: string;
  expiresAt: string;
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async signInWithGoogle(idToken: string): Promise<{ user: User; tenant: Tenant } & SessionIssued> {
    let identity;
    try {
      identity = await this.deps.googleIdentityVerifier.verify(idToken);
    } catch {
      throw new InvalidCredentialsError('Invalid Google credential');
    }

    if (!identity.emailVerified) {
      throw new InvalidCredentialsError('Google account email is not verified');
    }

    const { user, tenant } = await this.deps.userRepository.findOrCreateByGoogleProfile({
      googleSub: identity.sub,
      email: identity.email,
      name: identity.name,
    });

    const session = await this.createSession(user.id, tenant.id);

    return { user, tenant, ...session };
  }

  async logout(sessionId: string): Promise<void> {
    await this.deps.sessionRepository.delete(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.deps.sessionRepository.deleteAllForUser(userId);
  }

  async validateSession(sessionId: string): Promise<AuthContext | null> {
    const session = await this.deps.sessionRepository.findById(sessionId);

    if (!session) {
      return null;
    }

    const now = this.deps.clock.now();

    if (new Date(session.expiresAt).getTime() <= now.getTime()) {
      return null;
    }

    const user = await this.deps.userRepository.findById(session.userId);

    if (!user) {
      return null;
    }

    await this.maybeRenewSession(session.id, session.expiresAt, now);

    return { userId: user.id, tenantId: session.tenantId };
  }

  async deleteAccount(ctx: AuthContext): Promise<void> {
    await this.deps.sessionRepository.deleteAllForUser(ctx.userId);

    const plaidItems = await this.deps.plaidItemRepository.list(ctx.tenantId);
    for (const item of plaidItems) {
      try {
        const accessToken = await this.deps.encryptionService.decrypt(item.encryptedAccessToken);
        await this.deps.bankingProvider.removeItem(accessToken);
      } catch (error) {
        // Best-effort — never block account deletion on Plaid's API being
        // unavailable. Only the item id is logged, never the token.
        console.error(
          `[auth] Failed to revoke Plaid item ${item.id} during account deletion:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    await this.deps.plaidItemRepository.removeAllForTenant(ctx.tenantId);
    await this.deps.transactionRepository.removeAllForTenant(ctx.tenantId);

    await this.deps.incomeRepository.removeAllForTenant(ctx.tenantId);
    await this.deps.expenseRepository.removeAllForTenant(ctx.tenantId);
    await this.deps.accountRepository.removeAllForTenant(ctx.tenantId);
    await this.deps.userRepository.delete(ctx.userId, ctx.tenantId);
  }

  private async createSession(userId: string, tenantId: string): Promise<SessionIssued> {
    const now = this.deps.clock.now();
    const expiresAt = new Date(
      now.getTime() + this.deps.config.sessionDurationHours * 3_600_000,
    ).toISOString();

    const session = await this.deps.sessionRepository.create({
      id: this.deps.idGenerator.generate(),
      userId,
      tenantId,
      expiresAt,
      createdAt: now.toISOString(),
    });

    return { sessionId: session.id, expiresAt: session.expiresAt };
  }

  private async maybeRenewSession(sessionId: string, expiresAt: string, now: Date): Promise<void> {
    const totalDurationMs = this.deps.config.sessionDurationHours * 3_600_000;
    const remainingMs = new Date(expiresAt).getTime() - now.getTime();

    if (remainingMs > totalDurationMs / 2) {
      return;
    }

    const renewedExpiresAt = new Date(now.getTime() + totalDurationMs).toISOString();
    await this.deps.sessionRepository.touch(sessionId, renewedExpiresAt);
  }
}
