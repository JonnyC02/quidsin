import { createHash, randomBytes } from 'node:crypto';
import type { User } from '../domain/entities/user.js';
import type { Tenant } from '../domain/entities/tenant.js';
import { ValidationError } from '../domain/errors.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { SessionRepository } from '../ports/session-repository.js';
import type { PasswordResetTokenRepository } from '../ports/password-reset-token-repository.js';
import type { IncomeRepository } from '../ports/income-repository.js';
import type { ExpenseRepository } from '../ports/expense-repository.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { Notifier } from '../ports/notifier.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { AuthContext } from './auth-context.js';
import { InvalidCredentialsError } from '../domain/errors.js';

export interface AuthServiceConfig {
  sessionDurationHours: number;
  passwordResetTokenTtlMinutes: number;
  passwordResetBaseUrl: string;
}

export interface AuthServiceDeps {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  incomeRepository: IncomeRepository;
  expenseRepository: ExpenseRepository;
  accountRepository: AccountRepository;
  passwordHasher: PasswordHasher;
  notifier: Notifier;
  clock: Clock;
  idGenerator: IdGenerator;
  config: AuthServiceConfig;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SessionIssued {
  sessionId: string;
  expiresAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async register(input: RegisterInput): Promise<{ user: User; tenant: Tenant } & SessionIssued> {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.deps.passwordHasher.hash(input.password);

    const { user, tenant } = await this.deps.userRepository.register({
      email,
      passwordHash,
      name: input.name,
    });

    const session = await this.createSession(user.id, tenant.id);

    return { user, tenant, ...session };
  }

  async login(input: LoginInput): Promise<{ user: User } & SessionIssued> {
    const user = await this.deps.userRepository.findByEmail(normalizeEmail(input.email));

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.deps.passwordHasher.verify(
      user.passwordHash,
      input.password,
    );

    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const session = await this.createSession(user.id, user.tenantId);

    return { user, ...session };
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

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.deps.userRepository.findByEmail(normalizeEmail(email));

    // Always resolves, regardless of whether the email exists — never
    // reveal account existence through this endpoint.
    if (!user) {
      return;
    }

    const now = this.deps.clock.now();
    const expiresAt = new Date(
      now.getTime() + this.deps.config.passwordResetTokenTtlMinutes * 60_000,
    );
    const rawToken = randomBytes(32).toString('base64url');

    await this.deps.passwordResetTokenRepository.create({
      id: this.deps.idGenerator.generate(),
      userId: user.id,
      tokenHash: sha256Hex(rawToken),
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });

    const resetUrl = `${this.deps.config.passwordResetBaseUrl}?token=${rawToken}`;

    await this.deps.notifier.sendPasswordResetEmail({ to: user.email, resetUrl, expiresAt });
  }

  async resetPassword(input: { token: string; newPassword: string }): Promise<void> {
    const tokenHash = sha256Hex(input.token);
    const record = await this.deps.passwordResetTokenRepository.findByTokenHash(tokenHash);
    const now = this.deps.clock.now();

    if (!record || record.used || new Date(record.expiresAt).getTime() <= now.getTime()) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const passwordHash = await this.deps.passwordHasher.hash(input.newPassword);

    await this.deps.userRepository.updatePasswordHash(record.userId, passwordHash);
    await this.deps.passwordResetTokenRepository.markUsed(record.tokenHash);
    await this.deps.sessionRepository.deleteAllForUser(record.userId);
  }

  async deleteAccount(ctx: AuthContext): Promise<void> {
    await this.deps.sessionRepository.deleteAllForUser(ctx.userId);
    await this.deps.passwordResetTokenRepository.deleteAllForUser(ctx.userId);
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
