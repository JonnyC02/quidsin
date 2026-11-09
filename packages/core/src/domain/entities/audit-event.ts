export type AuditAction =
  | 'member_invited'
  | 'invite_accepted'
  | 'invite_declined'
  | 'invite_revoked'
  | 'member_removed'
  | 'member_left';

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  targetEmail?: string;
  targetUserId?: string;
  createdAt: string;
}
