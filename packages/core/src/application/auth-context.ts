/**
 * Always constructed server-side from a validated session — never from
 * client-supplied input. This is the sole boundary that scopes every
 * read/write to the caller's own tenant and ownership.
 */
export interface AuthContext {
  userId: string;
  tenantId: string;
}
