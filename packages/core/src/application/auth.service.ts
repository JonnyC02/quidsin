import type { User } from '../domain/entities/user.js';
import type { Tenant } from '../domain/entities/tenant.js';
import type { PlaidItem } from '../domain/entities/plaid-item.js';
import type { TenantRole } from '../domain/entities/tenant-membership.js';
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
import type { TenantMembershipRepository } from '../ports/tenant-membership-repository.js';
import type { TenantInviteRepository } from '../ports/tenant-invite-repository.js';
import type { AuditEventRepository } from '../ports/audit-event-repository.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { AuthContext } from './auth-context.js';
import { ConflictError, InvalidCredentialsError } from '../domain/errors.js';

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
  tenantMembershipRepository: TenantMembershipRepository;
  tenantInviteRepository: TenantInviteRepository;
  auditEventRepository: AuditEventRepository;
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

  async signInWithGoogle(
    idToken: string,
  ): Promise<{ user: User; tenant: Tenant; role: TenantRole } & SessionIssued> {
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

    // Idempotent — a no-op on every sign-in after the first. The user who
    // creates a tenant is always its Owner.
    const now = this.deps.clock.now().toISOString();
    const membership = await this.deps.tenantMembershipRepository.ensureMembership(
      tenant.id,
      user.id,
      'owner',
      now,
    );

    const session = await this.createSession(user.id, tenant.id);

    return { user, tenant, role: membership.role, ...session };
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

    // Resolved fresh on every request — if the caller's membership in this
    // tenant was revoked since the session was issued, the session becomes
    // invalid immediately, not just at next login.
    const role = await this.deps.tenantMembershipRepository.getRole(session.tenantId, user.id);

    if (!role) {
      return null;
    }

    await this.maybeRenewSession(session.id, session.expiresAt, now);

    return { userId: user.id, tenantId: session.tenantId, role };
  }

  /**
   * Operates across every tenant the user belongs to, not just the tenant
   * their current session happens to be scoped to — "delete my account"
   * means delete the user, not "wipe whatever tenant I'm currently acting
   * in" (which could be someone else's shared tenant).
   */
  async deleteAccount(ctx: AuthContext): Promise<void> {
    const user = await this.deps.userRepository.findById(ctx.userId);
    const memberships = await this.deps.tenantMembershipRepository.listForUser(ctx.userId);

    // Validate first, destroy nothing yet: an Owner can't self-delete while
    // someone else still depends on a tenant they own.
    for (const membership of memberships) {
      if (membership.role !== 'owner') {
        continue;
      }
      const members = await this.deps.tenantMembershipRepository.listForTenant(membership.tenantId);
      if (members.length > 1) {
        throw new ConflictError(
          'Remove all other members before deleting your account — you still own a shared tenant.',
        );
      }
    }

    // Every owned tenant is now confirmed solo; every other membership is
    // a plain "member" row. Safe to act.
    for (const membership of memberships) {
      if (membership.role === 'owner') {
        await this.wipeOwnedTenant(membership.tenantId);
      } else {
        await this.removeOwnRecordsFromTenant(membership.tenantId, ctx.userId);
        await this.deps.tenantMembershipRepository.remove(membership.tenantId, ctx.userId);
      }
    }

    await this.deps.sessionRepository.deleteAllForUser(ctx.userId);
    await this.deps.userRepository.delete(ctx.userId, user?.tenantId ?? ctx.tenantId);
  }

  private async revokePlaidItem(item: PlaidItem): Promise<void> {
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

  private async wipeOwnedTenant(tenantId: string): Promise<void> {
    const plaidItems = await this.deps.plaidItemRepository.list(tenantId);
    for (const item of plaidItems) {
      await this.revokePlaidItem(item);
    }

    await this.deps.plaidItemRepository.removeAllForTenant(tenantId);
    await this.deps.transactionRepository.removeAllForTenant(tenantId);
    await this.deps.incomeRepository.removeAllForTenant(tenantId);
    await this.deps.expenseRepository.removeAllForTenant(tenantId);
    await this.deps.accountRepository.removeAllForTenant(tenantId);
    await this.deps.tenantInviteRepository.removeAllForTenant(tenantId);
    await this.deps.auditEventRepository.removeAllForTenant(tenantId);
    await this.deps.tenantMembershipRepository.removeAllForTenant(tenantId);
  }

  /** A departing Member only loses their own records — the tenant and its other members are untouched. */
  private async removeOwnRecordsFromTenant(tenantId: string, ownerId: string): Promise<void> {
    const [incomes, expenses, accounts, plaidItems] = await Promise.all([
      this.deps.incomeRepository.list(tenantId),
      this.deps.expenseRepository.list(tenantId),
      this.deps.accountRepository.list(tenantId),
      this.deps.plaidItemRepository.list(tenantId),
    ]);

    for (const income of incomes) {
      if (income.ownerId === ownerId) {
        await this.deps.incomeRepository.remove(tenantId, income.id);
      }
    }
    for (const expense of expenses) {
      if (expense.ownerId === ownerId) {
        await this.deps.expenseRepository.remove(tenantId, expense.id);
      }
    }
    for (const account of accounts) {
      if (account.ownerId !== ownerId) {
        continue;
      }
      const transactions = await this.deps.transactionRepository.list(tenantId, {
        accountId: account.id,
      });
      for (const transaction of transactions) {
        await this.deps.transactionRepository.remove(tenantId, transaction.id);
      }
      await this.deps.accountRepository.remove(tenantId, account.id);
    }
    for (const item of plaidItems) {
      if (item.ownerId === ownerId) {
        // No single-item removal exists on this port (only
        // removeAllForTenant) — mark it disconnected instead, same
        // retention treatment as an ordinary Plaid disconnect.
        await this.revokePlaidItem(item);
        await this.deps.plaidItemRepository.markDisconnected(tenantId, item.id);
      }
    }
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
