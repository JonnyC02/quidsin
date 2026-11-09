import type { TenantMembership, TenantRole } from '../domain/entities/tenant-membership.js';

export interface TenantMembershipRepository {
  /** Idempotent — returns the existing row if the user is already a member. */
  ensureMembership(
    tenantId: string,
    userId: string,
    role: TenantRole,
    createdAt: string,
  ): Promise<TenantMembership>;
  getRole(tenantId: string, userId: string): Promise<TenantRole | null>;
  listForTenant(tenantId: string): Promise<TenantMembership[]>;
  listForUser(userId: string): Promise<TenantMembership[]>;
  remove(tenantId: string, userId: string): Promise<void>;
  removeAllForTenant(tenantId: string): Promise<void>;
}
