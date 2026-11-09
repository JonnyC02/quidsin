import type { Visibility } from './entities/visibility.js';

export interface VisibilityScoped {
  ownerId: string;
  visibility: Visibility;
  sharedWithUserIds?: string[];
}

/**
 * The one place the three-way visibility rule is decided. The owner always
 * sees their own record. "private" is owner-only, full stop — not even a
 * tenant Owner overrides it. "tenant" is visible to anyone (the caller
 * already belongs to the tenant by the time a record reaches this check,
 * since every query is already tenant-scoped). "shared" checks an
 * explicit per-record member list.
 */
export function canView(record: VisibilityScoped, ctx: { userId: string }): boolean {
  if (record.ownerId === ctx.userId) {
    return true;
  }

  switch (record.visibility) {
    case 'tenant':
      return true;
    case 'shared':
      return record.sharedWithUserIds?.includes(ctx.userId) ?? false;
    case 'private':
      return false;
  }
}
