import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoTenantMembershipRepository (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('tenant-membership-repo-test');
  });

  it('ensureMembership is idempotent — a second call returns the existing row, not a new one', async () => {
    const now = new Date().toISOString();
    const first = await ctx.tenantMembershipRepository.ensureMembership(
      'tenant-a',
      'user-a',
      'owner',
      now,
    );
    const second = await ctx.tenantMembershipRepository.ensureMembership(
      'tenant-a',
      'user-a',
      'member', // different role on the second call — ignored, the existing row wins
      new Date().toISOString(),
    );

    expect(second).toEqual(first);
    expect(await ctx.tenantMembershipRepository.getRole('tenant-a', 'user-a')).toBe('owner');
  });

  it('getRole returns null for a non-member', async () => {
    expect(await ctx.tenantMembershipRepository.getRole('tenant-a', 'unknown-user')).toBeNull();
  });

  it('listForTenant lists every member of a tenant', async () => {
    const now = new Date().toISOString();
    await ctx.tenantMembershipRepository.ensureMembership('tenant-b', 'user-owner', 'owner', now);
    await ctx.tenantMembershipRepository.ensureMembership('tenant-b', 'user-member', 'member', now);

    const members = await ctx.tenantMembershipRepository.listForTenant('tenant-b');
    expect(members.map((m) => m.userId).sort()).toEqual(['user-member', 'user-owner']);
  });

  it('listForUser finds every tenant a user belongs to, via GSI1', async () => {
    const now = new Date().toISOString();
    await ctx.tenantMembershipRepository.ensureMembership('tenant-c', 'user-multi', 'owner', now);
    await ctx.tenantMembershipRepository.ensureMembership('tenant-d', 'user-multi', 'member', now);

    const memberships = await ctx.tenantMembershipRepository.listForUser('user-multi');
    expect(memberships.map((m) => m.tenantId).sort()).toEqual(['tenant-c', 'tenant-d']);
  });

  it('remove deletes a single membership without affecting others', async () => {
    const now = new Date().toISOString();
    await ctx.tenantMembershipRepository.ensureMembership('tenant-e', 'user-owner', 'owner', now);
    await ctx.tenantMembershipRepository.ensureMembership('tenant-e', 'user-member', 'member', now);

    await ctx.tenantMembershipRepository.remove('tenant-e', 'user-member');

    expect(await ctx.tenantMembershipRepository.getRole('tenant-e', 'user-member')).toBeNull();
    expect(await ctx.tenantMembershipRepository.getRole('tenant-e', 'user-owner')).toBe('owner');
  });

  it('removeAllForTenant clears every membership for that tenant only', async () => {
    const now = new Date().toISOString();
    await ctx.tenantMembershipRepository.ensureMembership('tenant-f', 'user-x', 'owner', now);
    await ctx.tenantMembershipRepository.ensureMembership('tenant-g', 'user-y', 'owner', now);

    await ctx.tenantMembershipRepository.removeAllForTenant('tenant-f');

    expect(await ctx.tenantMembershipRepository.listForTenant('tenant-f')).toHaveLength(0);
    expect(await ctx.tenantMembershipRepository.listForTenant('tenant-g')).toHaveLength(1);
  });
});
