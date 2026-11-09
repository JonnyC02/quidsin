import { describe, expect, it } from 'vitest';
import { canView } from '../domain/visibility-rules.js';

const ctx = { userId: 'user-a' };

describe('canView', () => {
  it('the owner can always see their own record, regardless of visibility', () => {
    expect(canView({ ownerId: 'user-a', visibility: 'private' }, ctx)).toBe(true);
    expect(canView({ ownerId: 'user-a', visibility: 'tenant' }, ctx)).toBe(true);
    expect(canView({ ownerId: 'user-a', visibility: 'shared' }, ctx)).toBe(true);
  });

  it('"private" is owner-only, full stop — not visible to anyone else', () => {
    expect(canView({ ownerId: 'user-b', visibility: 'private' }, ctx)).toBe(false);
  });

  it('"tenant" is visible to anyone (tenant scoping already happened before this check)', () => {
    expect(canView({ ownerId: 'user-b', visibility: 'tenant' }, ctx)).toBe(true);
  });

  it('"shared" is visible only to users on the explicit list', () => {
    expect(canView({ ownerId: 'user-b', visibility: 'shared', sharedWithUserIds: ['user-a'] }, ctx)).toBe(
      true,
    );
    expect(canView({ ownerId: 'user-b', visibility: 'shared', sharedWithUserIds: ['user-c'] }, ctx)).toBe(
      false,
    );
    expect(canView({ ownerId: 'user-b', visibility: 'shared' }, ctx)).toBe(false);
  });
});
