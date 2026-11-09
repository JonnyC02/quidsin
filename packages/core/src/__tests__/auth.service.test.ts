import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService, ConflictError, InvalidCredentialsError } from '../index.js';
import {
  FakeBankingProvider,
  FakeGoogleIdentityVerifier,
  FixedClock,
  InMemoryAccountRepository,
  InMemoryAuditEventRepository,
  InMemoryEncryptionService,
  InMemoryPlaidItemRepository,
  InMemoryRecurringMoneyItemRepository,
  InMemorySessionRepository,
  InMemoryTenantInviteRepository,
  InMemoryTenantMembershipRepository,
  InMemoryTransactionRepository,
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
  const plaidItemRepository = new InMemoryPlaidItemRepository();
  const transactionRepository = new InMemoryTransactionRepository();
  const bankingProvider = new FakeBankingProvider();
  const encryptionService = new InMemoryEncryptionService();
  const tenantMembershipRepository = new InMemoryTenantMembershipRepository();
  const tenantInviteRepository = new InMemoryTenantInviteRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();

  const service = new AuthService({
    userRepository,
    sessionRepository,
    googleIdentityVerifier,
    incomeRepository,
    expenseRepository,
    accountRepository,
    plaidItemRepository,
    transactionRepository,
    tenantMembershipRepository,
    tenantInviteRepository,
    auditEventRepository,
    bankingProvider,
    encryptionService,
    clock,
    idGenerator: new SequentialIdGenerator(),
    config: { sessionDurationHours: 168 },
  });

  return {
    service,
    clock,
    googleIdentityVerifier,
    sessionRepository,
    userRepository,
    accountRepository,
    plaidItemRepository,
    bankingProvider,
    encryptionService,
    tenantMembershipRepository,
    tenantInviteRepository,
    auditEventRepository,
  };
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

    await ctx.service.deleteAccount({ userId: user.id, tenantId: tenant.id, role: 'owner' });

    expect(await ctx.service.validateSession(sessionId)).toBeNull();
    expect(await ctx.userRepository.findById(user.id)).toBeNull();

    const resignedIn = await ctx.service.signInWithGoogle('tok-jonny');
    expect(resignedIn.user.id).toBe(user.id); // same Google sub
    expect(resignedIn.tenant.id).not.toBe(tenant.id); // fresh tenant
  });

  it('revokes every Plaid item and removes them on account deletion', async () => {
    const { user, tenant } = await ctx.service.signInWithGoogle('tok-jonny');
    ctx.bankingProvider.seedExchange('pub-tok', {
      accessToken: 'access-token-1',
      plaidItemId: 'item-1',
    });
    await ctx.plaidItemRepository.create({
      id: 'item-1',
      tenantId: tenant.id,
      ownerId: user.id,
      encryptedAccessToken: await ctx.encryptionService.encrypt('access-token-1'),
      createdAt: ctx.clock.now().toISOString(),
      updatedAt: ctx.clock.now().toISOString(),
    });

    await ctx.service.deleteAccount({ userId: user.id, tenantId: tenant.id, role: 'owner' });

    expect(ctx.bankingProvider.removedAccessTokens).toContain('access-token-1');
    expect(await ctx.plaidItemRepository.list(tenant.id)).toHaveLength(0);
  });

  it('invalidates a session immediately once the caller\'s membership in that tenant is removed', async () => {
    const { user, tenant, sessionId } = await ctx.service.signInWithGoogle('tok-jonny');
    expect((await ctx.service.validateSession(sessionId))?.role).toBe('owner');

    await ctx.tenantMembershipRepository.remove(tenant.id, user.id);

    expect(await ctx.service.validateSession(sessionId)).toBeNull();
  });

  it('blocks account deletion while the caller still owns a tenant with other members', async () => {
    const { user, tenant } = await ctx.service.signInWithGoogle('tok-jonny');
    await ctx.tenantMembershipRepository.ensureMembership(
      tenant.id,
      'some-other-user',
      'member',
      ctx.clock.now().toISOString(),
    );

    await expect(
      ctx.service.deleteAccount({ userId: user.id, tenantId: tenant.id, role: 'owner' }),
    ).rejects.toThrow(ConflictError);

    // Nothing was destroyed by the failed attempt.
    expect(await ctx.userRepository.findById(user.id)).not.toBeNull();
    expect(await ctx.tenantMembershipRepository.listForTenant(tenant.id)).toHaveLength(2);
  });

  it('a departing Member only loses their own records — the tenant and its other members survive', async () => {
    const { tenant: ownerTenant } = await ctx.service.signInWithGoogle('tok-jonny');
    ctx.googleIdentityVerifier.seed('tok-partner', {
      sub: 'google-sub-2',
      email: 'partner@example.com',
      emailVerified: true,
      name: 'Partner',
    });
    const { user: partner } = await ctx.service.signInWithGoogle('tok-partner');
    await ctx.tenantMembershipRepository.ensureMembership(
      ownerTenant.id,
      partner.id,
      'member',
      ctx.clock.now().toISOString(),
    );
    const partnerOwnAccount = await ctx.accountRepository.create({
      id: 'partner-account',
      tenantId: ownerTenant.id,
      ownerId: partner.id,
      name: "Partner's own account",
      type: 'other',
      currency: 'GBP',
      balanceMinorUnits: 0,
      createdAt: ctx.clock.now().toISOString(),
      updatedAt: ctx.clock.now().toISOString(),
    });

    await ctx.service.deleteAccount({ userId: partner.id, tenantId: ownerTenant.id, role: 'member' });

    // The tenant itself and its owner are untouched — the owner's own
    // membership row is still there, proving the tenant wasn't wiped.
    expect(await ctx.tenantMembershipRepository.listForTenant(ownerTenant.id)).toHaveLength(1);
    // Only the departing member's own record is gone.
    expect(await ctx.accountRepository.getById(ownerTenant.id, partnerOwnAccount.id)).toBeNull();
    expect(await ctx.userRepository.findById(partner.id)).toBeNull();
  });
});
