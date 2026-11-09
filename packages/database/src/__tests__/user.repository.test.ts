import { beforeAll, describe, expect, it } from 'vitest';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoUserRepository (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('user-repo-test');
  });

  it('provisions a user and their personal tenant on first sign-in', async () => {
    const { user, tenant } = await ctx.userRepository.findOrCreateByGoogleProfile({
      googleSub: 'google-sub-provision',
      email: 'jonny@example.com',
      name: 'Jonny',
    });

    expect(user.id).toBe('google-sub-provision');
    expect(tenant.ownerId).toBe(user.id);
  });

  it('returns the same user and tenant on a repeat sign-in with the same Google sub', async () => {
    const first = await ctx.userRepository.findOrCreateByGoogleProfile({
      googleSub: 'google-sub-repeat',
      email: 'repeat@example.com',
    });
    const second = await ctx.userRepository.findOrCreateByGoogleProfile({
      googleSub: 'google-sub-repeat',
      email: 'repeat@example.com',
    });

    expect(second.user.id).toBe(first.user.id);
    expect(second.tenant.id).toBe(first.tenant.id);
  });

  it('finds a user by id (their Google sub), and returns null for an unknown id', async () => {
    const { user } = await ctx.userRepository.findOrCreateByGoogleProfile({
      googleSub: 'google-sub-findbyid',
      email: 'find-me@example.com',
    });

    expect(await ctx.userRepository.findById(user.id)).toMatchObject({
      email: 'find-me@example.com',
    });
    expect(await ctx.userRepository.findById('unknown-sub')).toBeNull();
  });

  it('deletes a user and tenant, allowing a fresh re-provision on the next sign-in', async () => {
    const { user, tenant } = await ctx.userRepository.findOrCreateByGoogleProfile({
      googleSub: 'google-sub-delete',
      email: 'delete-me@example.com',
    });

    await ctx.userRepository.delete(user.id, tenant.id);

    expect(await ctx.userRepository.findById(user.id)).toBeNull();

    // No leftover uniqueness-lock artifact blocks re-provisioning.
    const reprovisioned = await ctx.userRepository.findOrCreateByGoogleProfile({
      googleSub: 'google-sub-delete',
      email: 'delete-me@example.com',
    });
    expect(reprovisioned.user.id).toBe(user.id);
    expect(reprovisioned.tenant.id).not.toBe(tenant.id);
  });
});
