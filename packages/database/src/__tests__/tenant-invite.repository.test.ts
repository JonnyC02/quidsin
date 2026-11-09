import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoTenantInviteRepository (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('tenant-invite-repo-test');
  });

  it('creates an invite and finds it by (tenantId, id)', async () => {
    const now = new Date().toISOString();
    const invite = await ctx.tenantInviteRepository.create({
      id: 'invite-create',
      tenantId: 'tenant-a',
      invitedEmail: 'partner@example.com',
      invitedByUserId: 'owner-a',
      createdAt: now,
    });

    expect(invite.status).toBe('pending');
    expect(await ctx.tenantInviteRepository.getById('tenant-a', 'invite-create')).toMatchObject({
      invitedEmail: 'partner@example.com',
    });
  });

  it('listPendingByEmail finds pending invites across tenants via GSI1, case-insensitively', async () => {
    const now = new Date().toISOString();
    await ctx.tenantInviteRepository.create({
      id: 'invite-gsi1-a',
      tenantId: 'tenant-b',
      invitedEmail: 'Shared@Example.com',
      invitedByUserId: 'owner-b',
      createdAt: now,
    });
    await ctx.tenantInviteRepository.create({
      id: 'invite-gsi1-b',
      tenantId: 'tenant-c',
      invitedEmail: 'shared@example.com',
      invitedByUserId: 'owner-c',
      createdAt: now,
    });

    const pending = await ctx.tenantInviteRepository.listPendingByEmail('shared@example.com');
    expect(pending.map((i) => i.id).sort()).toEqual(['invite-gsi1-a', 'invite-gsi1-b']);
  });

  it('listPendingByEmail excludes invites that are no longer pending', async () => {
    const now = new Date().toISOString();
    await ctx.tenantInviteRepository.create({
      id: 'invite-declined',
      tenantId: 'tenant-d',
      invitedEmail: 'declined@example.com',
      invitedByUserId: 'owner-d',
      createdAt: now,
    });
    await ctx.tenantInviteRepository.updateStatus('tenant-d', 'invite-declined', 'declined', now);

    expect(await ctx.tenantInviteRepository.listPendingByEmail('declined@example.com')).toHaveLength(0);
  });

  it('updateStatus records the new status and respondedAt', async () => {
    const now = new Date().toISOString();
    await ctx.tenantInviteRepository.create({
      id: 'invite-accept',
      tenantId: 'tenant-e',
      invitedEmail: 'accept@example.com',
      invitedByUserId: 'owner-e',
      createdAt: now,
    });

    const updated = await ctx.tenantInviteRepository.updateStatus(
      'tenant-e',
      'invite-accept',
      'accepted',
      now,
    );

    expect(updated).toMatchObject({ status: 'accepted', respondedAt: now });
  });

  it('listForTenant and removeAllForTenant scope correctly', async () => {
    const now = new Date().toISOString();
    await ctx.tenantInviteRepository.create({
      id: 'invite-f1',
      tenantId: 'tenant-f',
      invitedEmail: 'one@example.com',
      invitedByUserId: 'owner-f',
      createdAt: now,
    });
    await ctx.tenantInviteRepository.create({
      id: 'invite-f2',
      tenantId: 'tenant-f',
      invitedEmail: 'two@example.com',
      invitedByUserId: 'owner-f',
      createdAt: now,
    });

    expect(await ctx.tenantInviteRepository.listForTenant('tenant-f')).toHaveLength(2);

    await ctx.tenantInviteRepository.removeAllForTenant('tenant-f');
    expect(await ctx.tenantInviteRepository.listForTenant('tenant-f')).toHaveLength(0);
  });
});
