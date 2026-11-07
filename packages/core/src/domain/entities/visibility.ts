/**
 * Record visibility. Only "private" is enforced in Phase 2 (every record is
 * owned by exactly one user within their personal tenant). "shared" and
 * "tenant" are reserved for Phase 4's sharing/permissions model and are not
 * acted on yet — they exist as real attributes now so Phase 4 doesn't need
 * a schema migration.
 */
export type Visibility = 'private' | 'shared' | 'tenant';
