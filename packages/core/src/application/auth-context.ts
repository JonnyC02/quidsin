/**
 * Always constructed server-side from a validated session — never from
 * client-supplied input. This is the sole boundary that scopes every
 * read/write to the caller's own tenant and ownership.
 */
import type { TenantRole } from '../domain/entities/tenant-membership.js';

export interface AuthContext {
  userId: string;
  tenantId: string;
  /** The caller's role in `tenantId` specifically — resolved fresh on every session validation. */
  role: TenantRole;
}
