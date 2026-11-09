export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface TenantInvite {
  id: string;
  tenantId: string;
  invitedEmail: string;
  invitedByUserId: string;
  status: InviteStatus;
  createdAt: string;
  respondedAt?: string;
}
