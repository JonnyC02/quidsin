import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoAuditEventRepository (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('audit-event-repo-test');
  });

  it('creates an event and lists it back, newest first', async () => {
    await ctx.auditEventRepository.create({
      id: 'event-1',
      tenantId: 'tenant-a',
      actorUserId: 'owner-a',
      action: 'member_invited',
      targetEmail: 'partner@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await ctx.auditEventRepository.create({
      id: 'event-2',
      tenantId: 'tenant-a',
      actorUserId: 'owner-a',
      action: 'invite_accepted',
      targetEmail: 'partner@example.com',
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    const events = await ctx.auditEventRepository.listForTenant('tenant-a');
    expect(events.map((e) => e.id)).toEqual(['event-2', 'event-1']);
  });

  it('removeAllForTenant clears only that tenant\'s events', async () => {
    await ctx.auditEventRepository.create({
      id: 'event-b1',
      tenantId: 'tenant-b',
      actorUserId: 'owner-b',
      action: 'member_removed',
      targetUserId: 'user-x',
      createdAt: new Date().toISOString(),
    });
    await ctx.auditEventRepository.create({
      id: 'event-c1',
      tenantId: 'tenant-c',
      actorUserId: 'owner-c',
      action: 'member_left',
      createdAt: new Date().toISOString(),
    });

    await ctx.auditEventRepository.removeAllForTenant('tenant-b');

    expect(await ctx.auditEventRepository.listForTenant('tenant-b')).toHaveLength(0);
    expect(await ctx.auditEventRepository.listForTenant('tenant-c')).toHaveLength(1);
  });
});
