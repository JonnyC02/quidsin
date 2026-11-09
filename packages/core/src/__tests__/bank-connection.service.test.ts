import { beforeEach, describe, expect, it } from 'vitest';
import { BankConnectionService, ForbiddenError, NotFoundError } from '../index.js';
import {
  FakeBankingProvider,
  FakeEntitlementChecker,
  FixedClock,
  InMemoryAccountRepository,
  InMemoryEncryptionService,
  InMemoryJobQueue,
  InMemoryPlaidItemRepository,
  SequentialIdGenerator,
} from './fakes.js';

const ctxA = { userId: 'user-a', tenantId: 'tenant-a', role: 'owner' as const };
const ctxB = { userId: 'user-b', tenantId: 'tenant-b', role: 'owner' as const };

function buildService() {
  const bankingProvider = new FakeBankingProvider();
  const plaidItemRepository = new InMemoryPlaidItemRepository();
  const accountRepository = new InMemoryAccountRepository();
  const jobQueue = new InMemoryJobQueue();
  const encryptionService = new InMemoryEncryptionService();
  const entitlementChecker = new FakeEntitlementChecker();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));

  const service = new BankConnectionService({
    bankingProvider,
    plaidItemRepository,
    accountRepository,
    jobQueue,
    encryptionService,
    entitlementChecker,
    clock,
    idGenerator: new SequentialIdGenerator(),
    config: {},
  });

  return {
    service,
    bankingProvider,
    plaidItemRepository,
    accountRepository,
    jobQueue,
    entitlementChecker,
  };
}

describe('BankConnectionService', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
    ctx.bankingProvider.seedExchange('pub-tok', {
      accessToken: 'access-token-1',
      plaidItemId: 'item-1',
      institutionId: 'ins_1',
      institutionName: 'Fake Bank',
    });
    ctx.bankingProvider.seedAccounts('access-token-1', [
      {
        plaidAccountId: 'plaid-acct-1',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balanceMinorUnits: 150_000,
        currency: 'GBP',
      },
      {
        plaidAccountId: 'plaid-acct-2',
        name: 'Savings',
        type: 'depository',
        subtype: 'savings',
        balanceMinorUnits: 500_000,
        currency: 'GBP',
      },
    ]);
  });

  it('exchanges a public token, provisions the item and its accounts, and enqueues the initial sync', async () => {
    const result = await ctx.service.exchangePublicToken(ctxA, 'pub-tok');

    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0]!.isManual).toBe(false);
    expect(result.accounts[0]!.plaidItemId).toBe('item-1');
    expect(result.accounts.map((a) => a.type)).toEqual(['current', 'savings']);

    const item = await ctx.plaidItemRepository.getById(ctxA.tenantId, 'item-1');
    expect(item?.status).toBe('active');
    expect(item?.encryptedAccessToken.ciphertext).not.toContain('access-token-1');

    const claimed = await ctx.jobQueue.claimNext('worker-1', 60_000);
    expect(claimed).toMatchObject({ tenantId: ctxA.tenantId, plaidItemId: 'item-1' });
  });

  it('never stores the plaintext access token anywhere in the created item', async () => {
    await ctx.service.exchangePublicToken(ctxA, 'pub-tok');
    const item = await ctx.plaidItemRepository.getById(ctxA.tenantId, 'item-1');

    expect(JSON.stringify(item)).not.toContain('access-token-1');
  });

  it('disconnects an item: revokes it, marks it disconnected, keeps accounts/data', async () => {
    await ctx.service.exchangePublicToken(ctxA, 'pub-tok');

    await ctx.service.disconnectItem(ctxA, 'item-1');

    expect(ctx.bankingProvider.removedAccessTokens).toContain('access-token-1');
    const item = await ctx.plaidItemRepository.getById(ctxA.tenantId, 'item-1');
    expect(item?.status).toBe('disconnected');
    // Accounts are retained — only the item's status changes.
    expect(await ctx.accountRepository.list(ctxA.tenantId)).toHaveLength(2);
  });

  it('rejects disconnecting or syncing an item owned by a different tenant', async () => {
    await ctx.service.exchangePublicToken(ctxA, 'pub-tok');

    await expect(ctx.service.disconnectItem(ctxB, 'item-1')).rejects.toThrow(NotFoundError);
    await expect(ctx.service.triggerSync(ctxB, 'item-1')).rejects.toThrow(NotFoundError);
  });

  it('triggerSync enqueues a sync job for an owned item ("Sync now")', async () => {
    await ctx.service.exchangePublicToken(ctxA, 'pub-tok');
    await ctx.jobQueue.claimNext('worker-1', 60_000); // drain the initial-sync job
    await ctx.jobQueue.complete('item-1');

    await ctx.service.triggerSync(ctxA, 'item-1');

    const claimed = await ctx.jobQueue.claimNext('worker-1', 60_000);
    expect(claimed).toMatchObject({ plaidItemId: 'item-1' });
  });

  it('a tenant without the bank_connections entitlement cannot create a link token or exchange a public token', async () => {
    ctx.entitlementChecker.setAllowed(false);

    await expect(ctx.service.createLinkToken(ctxA)).rejects.toThrow(ForbiddenError);
    await expect(ctx.service.exchangePublicToken(ctxA, 'pub-tok')).rejects.toThrow(ForbiddenError);
  });

  it('disconnecting and syncing an existing connection still work once the entitlement is revoked', async () => {
    await ctx.service.exchangePublicToken(ctxA, 'pub-tok');
    await ctx.jobQueue.claimNext('worker-1', 60_000);
    await ctx.jobQueue.complete('item-1');

    ctx.entitlementChecker.setAllowed(false);

    await ctx.service.triggerSync(ctxA, 'item-1');
    await ctx.service.disconnectItem(ctxA, 'item-1');

    const item = await ctx.plaidItemRepository.getById(ctxA.tenantId, 'item-1');
    expect(item?.status).toBe('disconnected');
  });
});
