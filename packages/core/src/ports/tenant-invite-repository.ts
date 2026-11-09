import type { InviteStatus, TenantInvite } from '../domain/entities/tenant-invite.js';

export interface NewTenantInvite {
  id: string;
  tenantId: string;
  invitedEmail: string;
  invitedByUserId: string;
  createdAt: string;
}

export interface TenantInviteRepository {
  create(invite: NewTenantInvite): Promise<TenantInvite>;
  getById(tenantId: string, id: string): Promise<TenantInvite | null>;
  listForTenant(tenantId: string): Promise<TenantInvite[]>;
  /** Pending invites addressed to this email, across every tenant. */
  listPendingByEmail(email: string): Promise<TenantInvite[]>;
  updateStatus(
    tenantId: string,
    id: string,
    status: InviteStatus,
    respondedAt: string,
  ): Promise<TenantInvite>;
  removeAllForTenant(tenantId: string): Promise<void>;
}
