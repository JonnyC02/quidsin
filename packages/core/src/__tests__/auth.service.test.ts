import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService, InvalidCredentialsError } from '../index.js';
import {
  FakeGoogleIdentityVerifier,
  FixedClock,
  InMemoryAccountRepository,
  InMemoryRecurringMoneyItemRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from './fakes.js';
import type { IncomeSource } from '../domain/entities/income.js';
import type { RecurringExpense } from '../domain/entities/expense.js';

const VERIFIED_IDENTITY = {
  sub: 'google-sub-1',
  email: 'jonny@example.com',
  emailVerified: true,
  name: 'Jonny',
};

function buildAuthService() {
  const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
  const googleIdentityVerifier = new FakeGoogleIdentityVerifier();
  const sessionRepository = new InMemorySessionRepository();
  const userRepository = new InMemoryUserRepository();
  const incomeRepository = new InMemoryRecurringMoneyItemRepository<IncomeSource>();
  const expenseRepository = new InMemoryRecurringMoneyItemRepository<RecurringExpense>();
  const accountRepository = new InMemoryAccountRepository();

  const service = new AuthService({
    userRepository,
    sessionRepository,
    googleIdentityVerifier,
    incomeRepository,
    expenseRepository,
    accountRepository,
    clock,
    idGenerator: new SequentialIdGenerator(),
    config: { sessionDurationHours: 168 },
  });

  return { service, clock, googleIdentityVerifier, sessionRepository, userRepository };
}

describe('AuthService', () => {
  let ctx: ReturnType<typeof buildAuthService>;

  beforeEach(() => {
    ctx = buildAuthService();
    ctx.googleIdentityVerifier.seed('tok-jonny', VERIFIED_IDENTITY);
  });

  it('signs in a new Google account, creates their tenant, and issues a session', async () => {
    const result = await ctx.service.signInWithGoogle('tok-jonny');

    expect(result.user.id).toBe('google-sub-1');
    expect(result.user.email).toBe('jonny@example.com');
    expect(result.tenant.ownerId).toBe(result.user.id);
    expect(result.sessionId).toBeTruthy();
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(ctx.clock.now().getTime());
  });

  it('reuses the same user and tenant on a second sign-in with the same Google sub', async () => {
    const first = await ctx.service.signInWithGoogle('tok-jonny');
    const second = await ctx.service.signInWithGoogle('tok-jonny');

    expect(second.user.id).toBe(first.user.id);
    expect(second.tenant.id).toBe(first.tenant.id);
    // A fresh session is still issued each sign-in.
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('rejects an unrecognized or unverifiable Google ID token', async () => {
    await expect(ctx.service.signInWithGoogle('not-a-real-token')).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rejects a Google account with an unverified email', async () => {
    ctx.googleIdentityVerifier.seed('tok-unverified', {
      ...VERIFIED_IDENTITY,
      sub: 'google-sub-2',
      emailVerified: false,
    });

    await expect(ctx.service.signInWithGoogle('tok-unverified')).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('validates an active session and returns null for an unknown or expired one', async () => {
    const { sessionId } = await ctx.service.signInWithGoogle('tok-jonny');

    const valid = await ctx.service.validateSession(sessionId);
    expect(valid?.userId).toBe('google-sub-1');

    expect(await ctx.service.validateSession('nope')).toBeNull();

    ctx.clock.set(new Date('2026-02-01T00:00:00.000Z')); // past the 168h expiry
    expect(await ctx.service.validateSession(sessionId)).toBeNull();
  });

  it('logs out by deleting the session', async () => {
    const { sessionId } = await ctx.service.signInWithGoogle('tok-jonny');
    await ctx.service.logout(sessionId);
    expect(await ctx.service.validateSession(sessionId)).toBeNull();
  });

  it('deletes an account and provisions a fresh user/tenant on re-sign-in with the same Google account', async () => {
    const { user, tenant, sessionId } = await ctx.service.signInWithGoogle('tok-jonny');

    await ctx.service.deleteAccount({ userId: user.id, tenantId: tenant.id });

    expect(await ctx.service.validateSession(sessionId)).toBeNull();
    expect(await ctx.userRepository.findById(user.id)).toBeNull();

    const resignedIn = await ctx.service.signInWithGoogle('tok-jonny');
    expect(resignedIn.user.id).toBe(user.id); // same Google sub
    expect(resignedIn.tenant.id).not.toBe(tenant.id); // fresh tenant
  });
});
