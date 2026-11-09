export type TenantRole = 'owner' | 'member';

export interface TenantMembership {
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: string;
}
