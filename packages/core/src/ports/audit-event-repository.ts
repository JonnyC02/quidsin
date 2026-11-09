import type { AuditAction, AuditEvent } from '../domain/entities/audit-event.js';

export interface NewAuditEvent {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  targetEmail?: string;
  targetUserId?: string;
  createdAt: string;
}

export interface AuditEventRepository {
  create(event: NewAuditEvent): Promise<AuditEvent>;
  /** Newest first. */
  listForTenant(tenantId: string): Promise<AuditEvent[]>;
  removeAllForTenant(tenantId: string): Promise<void>;
}
