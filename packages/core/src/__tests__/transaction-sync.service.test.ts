import { beforeEach, describe, expect, it } from 'vitest';
import { TransactionSyncService } from '../index.js';
import type { NewTransaction, Transaction, TransactionFilter, TransactionRepository } from '../index.js';
import {
  FakeBankingProvider,
  FixedClock,
  InMemoryAccountRepository,
  InMemoryEncryptionService,
  InMemoryPlaidItemRepository,
  InMemoryTransactionRepository,
} from './fakes.js';

const tenantId = 'tenant-a';
const plaidItemId = 'item-1';
const accessToken = 'access-token-1';

/** Delegates to a real repository but throws on a chosen upsert call — proves the cursor-advance ordering. */
class FailingOnNthUpsertTransactionRepository implements TransactionRepository {
  private upsertCallCount = 0;

  constructor(
    private readonly delegate: TransactionRepository,
    private readonly failOnUpsertCall: number,
  ) {}

  async upsert(transaction: NewTransaction): Promise<Transaction> {
    this.upsertCallCount += 1;
    if (this.upsertCallCount === this.failOnUpsertCall) {
      throw new Error('simulated failure mid-page');
    }
    return this.delegate.upsert(transaction);
  }

  remove(tenantId: string, id: string) {
    return this.delegate.remove(tenantId, id);
  }
  list(tenantId: string, filter?: TransactionFilter) {
    return this.delegate.list(tenantId, filter);
  }
  getById(tenantId: string, id: string) {
    return this.delegate.getById(tenantId, id);
  }
  updateNotes(tenantId: string, id: string, notes: string, updatedAt: string) {
    return this.delegate.updateNotes(tenantId, id, notes, updatedAt);
  }
  removeAllForTenant(tenantId: string) {
    return this.delegate.removeAllForTenant(tenantId);
  }
}

async function seedItemAndAccount(
  plaidItemRepository: InMemoryPlaidItemRepository,
  accountRepository: InMemoryAccountRepository,
  encryptionService: InMemoryEncryptionService,
) {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString();
  await plaidItemRepository.create({
    id: plaidItemId,
    tenantId,
    ownerId: 'user-a',
    encryptedAccessToken: await encryptionService.encrypt(accessToken),
    createdAt: now,
    updatedAt: now,
  });
  await accountRepository.create({
    id: 'account-1',
    tenantId,
    ownerId: 'user-a',
    name: 'Checking',
    type: 'current',
    currency: 'GBP',
    balanceMinorUnits: 0,
    isManual: false,
    plaidItemId,
    plaidAccountId: 'plaid-acct-1',
    createdAt: now,
    updatedAt: now,
  });
}

describe('TransactionSyncService', () => {
  let bankingProvider: FakeBankingProvider;
  let plaidItemRepository: InMemoryPlaidItemRepository;
  let accountRepository: InMemoryAccountRepository;
  let encryptionService: InMemoryEncryptionService;
  let clock: FixedClock;

  beforeEach(async () => {
    bankingProvider = new FakeBankingProvider();
    plaidItemRepository = new InMemoryPlaidItemRepository();
    accountRepository = new InMemoryAccountRepository();
    encryptionService = new InMemoryEncryptionService();
    clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));

    await seedItemAndAccount(plaidItemRepository, accountRepository, encryptionService);
  });

  it('applies added/modified/removed across paginated pages and advances the cursor to the final value', async () => {
    bankingProvider.seedSyncPages(accessToken, [
      {
        added: [
          {
            plaidTransactionId: 'txn-1',
            plaidAccountId: 'plaid-acct-1',
            amountMinorUnits: 1000,
            currency: 'GBP',
            description: 'Coffee',
            date: '2026-01-01',
            pending: false,
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'cursor-page-1',
        hasMore: true,
      },
      {
        added: [],
        modified: [
          {
            plaidTransactionId: 'txn-1',
            plaidAccountId: 'plaid-acct-1',
            amountMinorUnits: 1050,
            currency: 'GBP',
            description: 'Coffee (updated)',
            date: '2026-01-02', // date changed — proves no orphan via resolution #1
            pending: false,
          },
        ],
        removed: [],
        nextCursor: 'cursor-page-2',
        hasMore: false,
      },
    ]);

    const transactionRepository = new InMemoryTransactionRepository();
    const service = new TransactionSyncService({
      bankingProvider,
      plaidItemRepository,
      transactionRepository,
      accountRepository,
      encryptionService,
      clock,
    });

    await service.processItem({ tenantId, plaidItemId });

    const transactions = await transactionRepository.list(tenantId);
    expect(transactions).toHaveLength(1); // the modify updated the same row, no orphan
    expect(transactions[0]).toMatchObject({
      id: 'txn-1',
      amountMinorUnits: 1050,
      description: 'Coffee (updated)',
      date: '2026-01-02',
    });

    const item = await plaidItemRepository.getById(tenantId, plaidItemId);
    expect(item?.cursor).toBe('cursor-page-2');
  });

  it('removes transactions reported as removed by Plaid', async () => {
    bankingProvider.seedSyncPages(accessToken, [
      {
        added: [
          {
            plaidTransactionId: 'txn-1',
            plaidAccountId: 'plaid-acct-1',
            amountMinorUnits: 1000,
            currency: 'GBP',
            description: 'Coffee',
            date: '2026-01-01',
            pending: true,
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: true,
      },
      {
        added: [],
        modified: [],
        removed: [{ plaidTransactionId: 'txn-1' }],
        nextCursor: 'cursor-2',
        hasMore: false,
      },
    ]);

    const transactionRepository = new InMemoryTransactionRepository();
    const service = new TransactionSyncService({
      bankingProvider,
      plaidItemRepository,
      transactionRepository,
      accountRepository,
      encryptionService,
      clock,
    });

    await service.processItem({ tenantId, plaidItemId });

    expect(await transactionRepository.list(tenantId)).toHaveLength(0);
  });

  it('does not advance the cursor if a page fails partway through processing', async () => {
    bankingProvider.seedSyncPages(accessToken, [
      {
        added: [
          {
            plaidTransactionId: 'txn-1',
            plaidAccountId: 'plaid-acct-1',
            amountMinorUnits: 1000,
            currency: 'GBP',
            description: 'Coffee',
            date: '2026-01-01',
            pending: false,
          },
          {
            plaidTransactionId: 'txn-2',
            plaidAccountId: 'plaid-acct-1',
            amountMinorUnits: 2000,
            currency: 'GBP',
            description: 'Lunch',
            date: '2026-01-01',
            pending: false,
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'cursor-should-not-be-persisted',
        hasMore: false,
      },
    ]);

    const realRepository = new InMemoryTransactionRepository();
    // Fails on the 2nd upsert call — i.e. partway through the one page.
    const failingRepository = new FailingOnNthUpsertTransactionRepository(realRepository, 2);

    const service = new TransactionSyncService({
      bankingProvider,
      plaidItemRepository,
      transactionRepository: failingRepository,
      accountRepository,
      encryptionService,
      clock,
    });

    await expect(service.processItem({ tenantId, plaidItemId })).rejects.toThrow('simulated failure mid-page');

    const item = await plaidItemRepository.getById(tenantId, plaidItemId);
    expect(item?.cursor).toBeUndefined(); // never advanced
    expect(item?.status).toBe('error');
    // The first transaction DID get written (upsert is itself atomic per
    // call) — only the cursor advance, which only happens after the whole
    // page completes, was correctly skipped.
    expect(await realRepository.list(tenantId)).toHaveLength(1);
  });

  it('is a no-op for a disconnected item (stale queued job)', async () => {
    await plaidItemRepository.markDisconnected(tenantId, plaidItemId);
    bankingProvider.seedSyncPages(accessToken, []); // would throw if ever called

    const transactionRepository = new InMemoryTransactionRepository();
    const service = new TransactionSyncService({
      bankingProvider,
      plaidItemRepository,
      transactionRepository,
      accountRepository,
      encryptionService,
      clock,
    });

    await expect(service.processItem({ tenantId, plaidItemId })).resolves.toBeUndefined();
  });

  it('skips transactions for a Plaid account not linked to any known Account row', async () => {
    bankingProvider.seedSyncPages(accessToken, [
      {
        added: [
          {
            plaidTransactionId: 'txn-unknown',
            plaidAccountId: 'plaid-acct-unknown',
            amountMinorUnits: 500,
            currency: 'GBP',
            description: 'From a newly-added account',
            date: '2026-01-01',
            pending: false,
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      },
    ]);

    const transactionRepository = new InMemoryTransactionRepository();
    const service = new TransactionSyncService({
      bankingProvider,
      plaidItemRepository,
      transactionRepository,
      accountRepository,
      encryptionService,
      clock,
    });

    await service.processItem({ tenantId, plaidItemId });

    expect(await transactionRepository.list(tenantId)).toHaveLength(0);
    // The page still completes and the cursor still advances — an unknown
    // account isn't a processing failure.
    const item = await plaidItemRepository.getById(tenantId, plaidItemId);
    expect(item?.cursor).toBe('cursor-1');
  });
});
