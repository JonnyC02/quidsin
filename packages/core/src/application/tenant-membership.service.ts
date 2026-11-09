import type { Tenant } from '../domain/entities/tenant.js';
import type { TenantRole } from '../domain/entities/tenant-membership.js';
import type { TenantInvite } from '../domain/entities/tenant-invite.js';
import type { AuditEvent } from '../domain/entities/audit-event.js';
import type { TenantMembershipRepository } from '../ports/tenant-membership-repository.js';
import type { TenantInviteRepository } from '../ports/tenant-invite-repository.js';
import type { AuditEventRepository } from '../ports/audit-event-repository.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { TenantRepository } from '../ports/tenant-repository.js';
import type { SessionRepository } from '../ports/session-repository.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../domain/errors.js';
import type { AuthContext } from './auth-context.js';

export interface TenantMembershipServiceDeps {
  tenantMembershipRepository: TenantMembershipRepository;
  tenantInviteRepository: TenantInviteRepository;
  auditEventRepository: AuditEventRepository;
  userRepository: UserRepository;
  tenantRepository: TenantRepository;
  sessionRepository: SessionRepository;
  clock: Clock;
  idGenerator: IdGenerator;
}

export interface MemberSummary {
  userId: string;
  email: string;
  name?: string;
  role: TenantRole;
}

/** Owns every membership/invite/role/audit-log action. */
export class TenantMembershipService {
  constructor(private readonly deps: TenantMembershipServiceDeps) {}

  async listMyTenants(ctx: AuthContext): Promise<{ tenant: Tenant; role: TenantRole }[]> {
    const memberships = await this.deps.tenantMembershipRepository.listForUser(ctx.userId);

    const results: { tenant: Tenant; role: TenantRole }[] = [];
    for (const membership of memberships) {
      const tenant = await this.deps.tenantRepository.findById(membership.tenantId);
      if (tenant) {
        results.push({ tenant, role: membership.role });
      }
    }
    return results;
  }

  async switchTenant(ctx: AuthContext, sessionId: string, tenantId: string): Promise<AuthContext> {
    const role = await this.deps.tenantMembershipRepository.getRole(tenantId, ctx.userId);
    if (!role) {
      throw new NotFoundError();
    }

    await this.deps.sessionRepository.updateTenant(sessionId, tenantId);
    return { userId: ctx.userId, tenantId, role };
  }

  async listMembers(ctx: AuthContext): Promise<MemberSummary[]> {
    const memberships = await this.deps.tenantMembershipRepository.listForTenant(ctx.tenantId);

    const results: MemberSummary[] = [];
    for (const membership of memberships) {
      const user = await this.deps.userRepository.findById(membership.userId);
      if (user) {
        results.push({ userId: user.id, email: user.email, name: user.name, role: membership.role });
      }
    }
    return results;
  }

  async inviteMember(ctx: AuthContext, email: string): Promise<TenantInvite> {
    this.requireOwner(ctx);

    const members = await this.listMembers(ctx);
    if (members.some((member) => member.email.toLowerCase() === email.toLowerCase())) {
      throw new ConflictError('That email is already a member of this tenant.');
    }

    const now = this.deps.clock.now().toISOString();
    const invite = await this.deps.tenantInviteRepository.create({
      id: this.deps.idGenerator.generate(),
      tenantId: ctx.tenantId,
      invitedEmail: email,
      invitedByUserId: ctx.userId,
      createdAt: now,
    });

    await this.recordAuditEvent(ctx, 'member_invited', { targetEmail: email });

    return invite;
  }

  async listInvites(ctx: AuthContext): Promise<TenantInvite[]> {
    this.requireOwner(ctx);
    return this.deps.tenantInviteRepository.listForTenant(ctx.tenantId);
  }

  async revokeInvite(ctx: AuthContext, inviteId: string): Promise<void> {
    this.requireOwner(ctx);

    const invite = await this.deps.tenantInviteRepository.getById(ctx.tenantId, inviteId);
    if (!invite) {
      throw new NotFoundError();
    }

    const now = this.deps.clock.now().toISOString();
    await this.deps.tenantInviteRepository.updateStatus(ctx.tenantId, inviteId, 'revoked', now);
    await this.recordAuditEvent(ctx, 'invite_revoked', { targetEmail: invite.invitedEmail });
  }

  /** Pending invites addressed to the caller, across every tenant — independent of the caller's current tenant/role. */
  async listPendingInvitesForCurrentUser(ctx: AuthContext): Promise<TenantInvite[]> {
    const user = await this.deps.userRepository.findById(ctx.userId);
    if (!user) {
      return [];
    }
    return this.deps.tenantInviteRepository.listPendingByEmail(user.email);
  }

  async acceptInvite(ctx: AuthContext, tenantId: string, inviteId: string): Promise<void> {
    const { invite, user } = await this.loadOwnPendingInvite(ctx, tenantId, inviteId);

    const now = this.deps.clock.now().toISOString();
    await this.deps.tenantMembershipRepository.ensureMembership(tenantId, user.id, 'member', now);
    await this.deps.tenantInviteRepository.updateStatus(tenantId, inviteId, 'accepted', now);
    await this.recordAuditEventAs(user.id, tenantId, 'invite_accepted', { targetEmail: invite.invitedEmail });
  }

  async declineInvite(ctx: AuthContext, tenantId: string, inviteId: string): Promise<void> {
    const { invite, user } = await this.loadOwnPendingInvite(ctx, tenantId, inviteId);

    const now = this.deps.clock.now().toISOString();
    await this.deps.tenantInviteRepository.updateStatus(tenantId, inviteId, 'declined', now);
    await this.recordAuditEventAs(user.id, tenantId, 'invite_declined', { targetEmail: invite.invitedEmail });
  }

  async removeMember(ctx: AuthContext, userId: string): Promise<void> {
    this.requireOwner(ctx);

    if (userId === ctx.userId) {
      throw new ForbiddenError('An Owner cannot remove themselves — delete your account instead.');
    }

    const role = await this.deps.tenantMembershipRepository.getRole(ctx.tenantId, userId);
    if (!role) {
      throw new NotFoundError();
    }

    await this.deps.tenantMembershipRepository.remove(ctx.tenantId, userId);
    await this.recordAuditEvent(ctx, 'member_removed', { targetUserId: userId });
  }

  async leaveTenant(ctx: AuthContext, sessionId: string): Promise<void> {
    if (ctx.role === 'owner') {
      throw new ForbiddenError('An Owner cannot leave their own tenant — delete your account instead.');
    }

    await this.deps.tenantMembershipRepository.remove(ctx.tenantId, ctx.userId);
    await this.recordAuditEvent(ctx, 'member_left', {});

    const user = await this.deps.userRepository.findById(ctx.userId);
    if (user) {
      // Don't leave the session pointed at a tenant they just lost access to.
      await this.deps.sessionRepository.updateTenant(sessionId, user.tenantId);
    }
  }

  async listAuditLog(ctx: AuthContext): Promise<AuditEvent[]> {
    this.requireOwner(ctx);
    return this.deps.auditEventRepository.listForTenant(ctx.tenantId);
  }

  private requireOwner(ctx: AuthContext): void {
    if (ctx.role !== 'owner') {
      throw new ForbiddenError('Only the tenant Owner can do this.');
    }
  }

  private async loadOwnPendingInvite(
    ctx: AuthContext,
    tenantId: string,
    inviteId: string,
  ): Promise<{ invite: TenantInvite; user: { id: string; email: string; tenantId: string } }> {
    const user = await this.deps.userRepository.findById(ctx.userId);
    if (!user) {
      throw new NotFoundError();
    }

    const invite = await this.deps.tenantInviteRepository.getById(tenantId, inviteId);
    if (
      !invite ||
      invite.status !== 'pending' ||
      invite.invitedEmail.toLowerCase() !== user.email.toLowerCase()
    ) {
      throw new NotFoundError();
    }

    return { invite, user };
  }

  private async recordAuditEvent(
    ctx: AuthContext,
    action: AuditEvent['action'],
    target: { targetEmail?: string; targetUserId?: string },
  ): Promise<void> {
    await this.recordAuditEventAs(ctx.userId, ctx.tenantId, action, target);
  }

  private async recordAuditEventAs(
    actorUserId: string,
    tenantId: string,
    action: AuditEvent['action'],
    target: { targetEmail?: string; targetUserId?: string },
  ): Promise<void> {
    await this.deps.auditEventRepository.create({
      id: this.deps.idGenerator.generate(),
      tenantId,
      actorUserId,
      action,
      ...target,
      createdAt: this.deps.clock.now().toISOString(),
    });
  }
}
