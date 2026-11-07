import { beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '@quidsin/core';
import { DYNAMODB_ENDPOINT, setUpTestTable } from './test-helpers.js';

describe.skipIf(!DYNAMODB_ENDPOINT)('DynamoUserRepository (live)', () => {
  let ctx: Awaited<ReturnType<typeof setUpTestTable>>;

  beforeAll(async () => {
    ctx = await setUpTestTable('user-repo-test');
  });

  it('registers a user with their own tenant and enforces email uniqueness', async () => {
    const { user, tenant } = await ctx.userRepository.register({
      email: 'jonny@example.com',
      passwordHash: 'hashed',
      name: 'Jonny',
    });

    expect(tenant.ownerId).toBe(user.id);

    await expect(
      ctx.userRepository.register({ email: 'jonny@example.com', passwordHash: 'other' }),
    ).rejects.toThrow(ConflictError);
  });

  it('finds a user by id and by email', async () => {
    const { user } = await ctx.userRepository.register({
      email: 'find-me@example.com',
      passwordHash: 'hashed',
    });

    expect(await ctx.userRepository.findById(user.id)).toMatchObject({
      email: 'find-me@example.com',
    });
    expect(await ctx.userRepository.findByEmail('find-me@example.com')).toMatchObject({
      id: user.id,
    });
    expect(await ctx.userRepository.findByEmail('nobody@example.com')).toBeNull();
  });

  it('updates the password hash', async () => {
    const { user } = await ctx.userRepository.register({
      email: 'update-pw@example.com',
      passwordHash: 'old-hash',
    });

    await ctx.userRepository.updatePasswordHash(user.id, 'new-hash');
    expect(await ctx.userRepository.findById(user.id)).toMatchObject({ passwordHash: 'new-hash' });
  });

  it('deletes a user, their tenant, and their email lock, allowing re-registration', async () => {
    const { user, tenant } = await ctx.userRepository.register({
      email: 'delete-me@example.com',
      passwordHash: 'hashed',
    });

    await ctx.userRepository.delete(user.id, tenant.id);

    expect(await ctx.userRepository.findById(user.id)).toBeNull();
    expect(await ctx.userRepository.findByEmail('delete-me@example.com')).toBeNull();

    await expect(
      ctx.userRepository.register({ email: 'delete-me@example.com', passwordHash: 'new' }),
    ).resolves.toBeTruthy();
  });
});
