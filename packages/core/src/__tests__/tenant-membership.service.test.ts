import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, TenantMembershipService } from '../index.js';
import {
  FixedClock,
  InMemoryAuditEventRepository,
  InMemorySessionRepository,
  InMemoryTenantInviteRepository,
  InMemoryTenantMembershipRepository,
  InMemoryTenantRepository,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from './fakes.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

async function buildService() {
  const clock = new FixedClock(NOW);
  const idGenerator = new SequentialIdGenerator();
  const tenantMembershipRepository = new InMemoryTenantMembershipRepository();
  const tenantInviteRepository = new InMemoryTenantInviteRepository();
  const auditEventRepository = new InMemoryAuditEventRepository();
  const userRepository = new InMemoryUserRepository();
  const tenantRepository = new InMemoryTenantRepository();
  const sessionRepository = new InMemorySessionRepository();

  const service = new TenantMembershipService({
    tenantMembershipRepository,
    tenantInviteRepository,
    auditEventRepository,
    userRepository,
    tenantRepository,
    sessionRepository,
    clock,
    idGenerator,
  });

  // Seed an Owner (Jonny, tenant-a) via the same provisioning path AuthService uses.
  const { user: owner, tenant } = await userRepository.findOrCreateByGoogleProfile({
    googleSub: 'owner-sub',
    email: 'owner@example.com',
    name: 'Owner',
  });
  tenantRepository.seed(tenant);
  await tenantMembershipRepository.ensureMembership(tenant.id, owner.id, 'owner', NOW.toISOString());

  // A second user (Partner) with their own separate home tenant.
  const { user: partner, tenant: partnerTenant } = await userRepository.findOrCreateByGoogleProfile({
    googleSub: 'partner-sub',
    email: 'partner@example.com',
    name: 'Partner',
  });
  tenantRepository.seed(partnerTenant);
  await tenantMembershipRepository.ensureMembership(
    partnerTenant.id,
    partner.id,
    'owner',
    NOW.toISOString(),
  );

  return {
    service,
    clock,
    tenantMembershipRepository,
    tenantInviteRepository,
    auditEventRepository,
    userRepository,
    tenantRepository,
    sessionRepository,
    owner,
    tenant,
    partner,
    partnerTenant,
  };
}

describe('TenantMembershipService', () => {
  let ctx: Awaited<ReturnType<typeof buildService>>;

  beforeEach(async () => {
    ctx = await buildService();
  });

  function ownerCtx() {
    return { userId: ctx.owner.id, tenantId: ctx.tenant.id, role: 'owner' as const };
  }

  function partnerCtx(tenantId = ctx.partnerTenant.id) {
    return { userId: ctx.partner.id, tenantId, role: 'owner' as const };
  }

  it('invites a member, who can then accept it and gains membership', async () => {
    const invite = await ctx.service.inviteMember(ownerCtx(), 'partner@example.com');
    expect(invite.status).toBe('pending');

    const pending = await ctx.service.listPendingInvitesForCurrentUser(partnerCtx());
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(invite.id);

    await ctx.service.acceptInvite(partnerCtx(), ctx.tenant.id, invite.id);

    const role = await ctx.tenantMembershipRepository.getRole(ctx.tenant.id, ctx.partner.id);
    expect(role).toBe('member');

    const members = await ctx.service.listMembers(ownerCtx());
    expect(members.map((m) => m.email)).toContain('partner@example.com');
  });

  it('declining an invite does not create a membership', async () => {
    const invite = await ctx.service.inviteMember(ownerCtx(), 'partner@example.com');

    await ctx.service.declineInvite(partnerCtx(), ctx.tenant.id, invite.id);

    expect(await ctx.tenantMembershipRepository.getRole(ctx.tenant.id, ctx.partner.id)).toBeNull();
  });

  it('rejects inviting an email that is already a member', async () => {
    await expect(ctx.service.inviteMember(ownerCtx(), 'owner@example.com')).rejects.toThrow(
      ConflictError,
    );
  });

  it('non-owners cannot invite, remove members, revoke invites, or read the audit log', async () => {
    const invite = await ctx.service.inviteMember(ownerCtx(), 'partner@example.com');
    await ctx.service.acceptInvite(partnerCtx(), ctx.tenant.id, invite.id);
    const memberCtx = { userId: ctx.partner.id, tenantId: ctx.tenant.id, role: 'member' as const };

    await expect(ctx.service.inviteMember(memberCtx, 'someone-else@example.com')).rejects.toThrow(
      ForbiddenError,
    );
    await expect(ctx.service.removeMember(memberCtx, ctx.owner.id)).rejects.toThrow(ForbiddenError);
    await expect(ctx.service.revokeInvite(memberCtx, invite.id)).rejects.toThrow(ForbiddenError);
    await expect(ctx.service.listAuditLog(memberCtx)).rejects.toThrow(ForbiddenError);
  });

  it('an owner cannot remove themselves', async () => {
    await expect(ctx.service.removeMember(ownerCtx(), ctx.owner.id)).rejects.toThrow(ForbiddenError);
  });

  it('removing a member deletes their membership and records an audit event', async () => {
    const invite = await ctx.service.inviteMember(ownerCtx(), 'partner@example.com');
    await ctx.service.acceptInvite(partnerCtx(), ctx.tenant.id, invite.id);

    await ctx.service.removeMember(ownerCtx(), ctx.partner.id);

    expect(await ctx.tenantMembershipRepository.getRole(ctx.tenant.id, ctx.partner.id)).toBeNull();
    const log = await ctx.service.listAuditLog(ownerCtx());
    expect(log.some((e) => e.action === 'member_removed' && e.targetUserId === ctx.partner.id)).toBe(
      true,
    );
  });

  it('an owner cannot leave their own tenant', async () => {
    await expect(ctx.service.leaveTenant(ownerCtx(), 'session-1')).rejects.toThrow(ForbiddenError);
  });

  it('leaving switches the departing member\'s session back to their own home tenant', async () => {
    const invite = await ctx.service.inviteMember(ownerCtx(), 'partner@example.com');
    await ctx.service.acceptInvite(partnerCtx(), ctx.tenant.id, invite.id);

    const session = await ctx.sessionRepository.create({
      id: 'session-1',
      userId: ctx.partner.id,
      tenantId: ctx.tenant.id,
      expiresAt: new Date(ctx.clock.now().getTime() + 3_600_000).toISOString(),
      createdAt: ctx.clock.now().toISOString(),
    });

    const memberCtx = { userId: ctx.partner.id, tenantId: ctx.tenant.id, role: 'member' as const };
    await ctx.service.leaveTenant(memberCtx, session.id);

    expect(await ctx.tenantMembershipRepository.getRole(ctx.tenant.id, ctx.partner.id)).toBeNull();
    const updatedSession = await ctx.sessionRepository.findById(session.id);
    expect(updatedSession?.tenantId).toBe(ctx.partnerTenant.id);
  });

  it('switching tenants requires an existing membership', async () => {
    const session = await ctx.sessionRepository.create({
      id: 'session-2',
      userId: ctx.partner.id,
      tenantId: ctx.partnerTenant.id,
      expiresAt: new Date(ctx.clock.now().getTime() + 3_600_000).toISOString(),
      createdAt: ctx.clock.now().toISOString(),
    });

    await expect(ctx.service.switchTenant(partnerCtx(), session.id, ctx.tenant.id)).rejects.toThrow(
      NotFoundError,
    );

    const invite = await ctx.service.inviteMember(ownerCtx(), 'partner@example.com');
    await ctx.service.acceptInvite(partnerCtx(), ctx.tenant.id, invite.id);

    const switched = await ctx.service.switchTenant(partnerCtx(), session.id, ctx.tenant.id);
    expect(switched).toEqual({ userId: ctx.partner.id, tenantId: ctx.tenant.id, role: 'member' });
  });
});
