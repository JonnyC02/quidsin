import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoSessionRepository (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('session-repo-test');
  });

  it('creates, finds, touches (renews), and deletes a session', async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000).toISOString();

    const session = await ctx.sessionRepository.create({
      id: 'session-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      expiresAt,
      createdAt: now.toISOString(),
    });

    expect(await ctx.sessionRepository.findById(session.id)).toMatchObject({ userId: 'user-1' });

    const renewedExpiresAt = new Date(now.getTime() + 120_000).toISOString();
    await ctx.sessionRepository.touch(session.id, renewedExpiresAt);
    expect(await ctx.sessionRepository.findById(session.id)).toMatchObject({
      expiresAt: renewedExpiresAt,
    });

    await ctx.sessionRepository.delete(session.id);
    expect(await ctx.sessionRepository.findById(session.id)).toBeNull();
  });

  it('deletes all sessions for a user via the GSI, leaving other users untouched', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const createdAt = new Date().toISOString();

    await ctx.sessionRepository.create({
      id: 'a-1',
      userId: 'user-a',
      tenantId: 'tenant-a',
      expiresAt,
      createdAt,
    });
    await ctx.sessionRepository.create({
      id: 'a-2',
      userId: 'user-a',
      tenantId: 'tenant-a',
      expiresAt,
      createdAt,
    });
    await ctx.sessionRepository.create({
      id: 'b-1',
      userId: 'user-b',
      tenantId: 'tenant-b',
      expiresAt,
      createdAt,
    });

    await ctx.sessionRepository.deleteAllForUser('user-a');

    expect(await ctx.sessionRepository.findById('a-1')).toBeNull();
    expect(await ctx.sessionRepository.findById('a-2')).toBeNull();
    expect(await ctx.sessionRepository.findById('b-1')).not.toBeNull();
  });
});
