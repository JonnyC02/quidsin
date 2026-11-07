import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService, InvalidCredentialsError, ValidationError } from '../index.js';
import {
  CapturingNotifier,
  FakePasswordHasher,
  FixedClock,
  InMemoryAccountRepository,
  InMemoryPasswordResetTokenRepository,
  InMemoryRecurringMoneyItemRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from './fakes.js';
import type { IncomeSource } from '../domain/entities/income.js';
import type { RecurringExpense } from '../domain/entities/expense.js';

function buildAuthService() {
  const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
  const notifier = new CapturingNotifier();
  const sessionRepository = new InMemorySessionRepository();
  const passwordResetTokenRepository = new InMemoryPasswordResetTokenRepository();
  const userRepository = new InMemoryUserRepository();
  const incomeRepository = new InMemoryRecurringMoneyItemRepository<IncomeSource>();
  const expenseRepository = new InMemoryRecurringMoneyItemRepository<RecurringExpense>();
  const accountRepository = new InMemoryAccountRepository();

  const service = new AuthService({
    userRepository,
    sessionRepository,
    passwordResetTokenRepository,
    incomeRepository,
    expenseRepository,
    accountRepository,
    passwordHasher: new FakePasswordHasher(),
    notifier,
    clock,
    idGenerator: new SequentialIdGenerator(),
    config: {
      sessionDurationHours: 168,
      passwordResetTokenTtlMinutes: 60,
      passwordResetBaseUrl: 'http://localhost:5173/reset-password',
    },
  });

  return {
    service,
    clock,
    notifier,
    sessionRepository,
    passwordResetTokenRepository,
    userRepository,
  };
}

describe('AuthService', () => {
  let ctx: ReturnType<typeof buildAuthService>;

  beforeEach(() => {
    ctx = buildAuthService();
  });

  it('registers a user, creates their tenant, and issues a session', async () => {
    const result = await ctx.service.register({
      email: 'Jonny@Example.com',
      password: 'secret123',
    });

    expect(result.user.email).toBe('jonny@example.com');
    expect(result.tenant.ownerId).toBe(result.user.id);
    expect(result.sessionId).toBeTruthy();
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(ctx.clock.now().getTime());
  });

  it('rejects registering the same email twice', async () => {
    await ctx.service.register({ email: 'jonny@example.com', password: 'secret123' });
    await expect(
      ctx.service.register({ email: 'jonny@example.com', password: 'other' }),
    ).rejects.toThrow();
  });

  it('logs in with correct credentials and rejects incorrect ones', async () => {
    await ctx.service.register({ email: 'jonny@example.com', password: 'secret123' });

    const login = await ctx.service.login({ email: 'jonny@example.com', password: 'secret123' });
    expect(login.user.email).toBe('jonny@example.com');

    await expect(
      ctx.service.login({ email: 'jonny@example.com', password: 'wrong' }),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      ctx.service.login({ email: 'unknown@example.com', password: 'wrong' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('validates an active session and returns null for an unknown or expired one', async () => {
    const { sessionId } = await ctx.service.register({
      email: 'jonny@example.com',
      password: 'secret123',
    });

    const valid = await ctx.service.validateSession(sessionId);
    expect(valid?.userId).toBeTruthy();

    expect(await ctx.service.validateSession('nope')).toBeNull();

    ctx.clock.set(new Date('2026-02-01T00:00:00.000Z')); // past the 168h expiry
    expect(await ctx.service.validateSession(sessionId)).toBeNull();
  });

  it('logs out by deleting the session', async () => {
    const { sessionId } = await ctx.service.register({
      email: 'jonny@example.com',
      password: 'secret123',
    });
    await ctx.service.logout(sessionId);
    expect(await ctx.service.validateSession(sessionId)).toBeNull();
  });

  it('completes a full password reset flow and invalidates existing sessions', async () => {
    const { user, sessionId } = await ctx.service.register({
      email: 'jonny@example.com',
      password: 'secret123',
    });

    await ctx.service.requestPasswordReset('jonny@example.com');
    expect(ctx.notifier.sentEmails).toHaveLength(1);

    const resetUrl = ctx.notifier.sentEmails[0]!.resetUrl;
    const token = new URL(resetUrl).searchParams.get('token')!;

    await ctx.service.resetPassword({ token, newPassword: 'newpassword456' });

    // Old session is gone...
    expect(await ctx.service.validateSession(sessionId)).toBeNull();

    // ...old password no longer works, new one does.
    await expect(
      ctx.service.login({ email: 'jonny@example.com', password: 'secret123' }),
    ).rejects.toThrow();
    const relogin = await ctx.service.login({
      email: 'jonny@example.com',
      password: 'newpassword456',
    });
    expect(relogin.user.id).toBe(user.id);
  });

  it('does not reveal whether an email exists when requesting a reset', async () => {
    await expect(ctx.service.requestPasswordReset('unknown@example.com')).resolves.toBeUndefined();
    expect(ctx.notifier.sentEmails).toHaveLength(0);
  });

  it('rejects an invalid or already-used reset token', async () => {
    await expect(
      ctx.service.resetPassword({ token: 'bogus', newPassword: 'whatever123' }),
    ).rejects.toThrow(ValidationError);

    await ctx.service.register({ email: 'jonny@example.com', password: 'secret123' });
    await ctx.service.requestPasswordReset('jonny@example.com');
    const token = new URL(ctx.notifier.sentEmails[0]!.resetUrl).searchParams.get('token')!;

    await ctx.service.resetPassword({ token, newPassword: 'newpassword456' });
    await expect(ctx.service.resetPassword({ token, newPassword: 'again12345' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('deletes an account and all of its sessions/reset tokens', async () => {
    const { user, tenant, sessionId } = await ctx.service.register({
      email: 'jonny@example.com',
      password: 'secret123',
    });

    await ctx.service.deleteAccount({ userId: user.id, tenantId: tenant.id });

    expect(await ctx.service.validateSession(sessionId)).toBeNull();
    expect(await ctx.userRepository.findById(user.id)).toBeNull();

    // Re-registering with the same email should now succeed.
    await expect(
      ctx.service.register({ email: 'jonny@example.com', password: 'brandnew123' }),
    ).resolves.toBeTruthy();
  });
});
