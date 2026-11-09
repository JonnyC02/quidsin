import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';
import type { FakeGoogleIdentityVerifier } from './fakes.js';

async function signIn(
  app: Parameters<typeof request.agent>[0],
  googleIdentityVerifier: FakeGoogleIdentityVerifier,
  sub: string,
) {
  const agent = request.agent(app);
  googleIdentityVerifier.seed(`tok-${sub}`, { sub, email: `${sub}@example.com`, emailVerified: true });
  await agent.post('/auth/google').send({ idToken: `tok-${sub}` });
  return agent;
}

describe('/plaid routes', () => {
  it('rejects unauthenticated requests', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/plaid/link-token').send({});
    expect(response.status).toBe(401);
  });

  it('creates a link token for the signed-in user', async () => {
    const { app, googleIdentityVerifier, bankingProvider } = buildTestApp();
    bankingProvider.seedLinkToken('link-token-abc');
    const agent = await signIn(app, googleIdentityVerifier, 'g-jonny');

    const response = await agent.post('/plaid/link-token').send({});
    expect(response.status).toBe(200);
    expect(response.body.linkToken).toBe('link-token-abc');
  });

  it('exchanges a public token and provisions accounts', async () => {
    const { app, googleIdentityVerifier, bankingProvider } = buildTestApp();
    bankingProvider.seedExchange('public-token', {
      accessToken: 'access-token',
      plaidItemId: 'item-1',
      institutionName: 'Test Bank',
    });
    bankingProvider.seedAccounts('access-token', [
      {
        plaidAccountId: 'plaid-acct-1',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balanceMinorUnits: 10_000,
        currency: 'GBP',
      },
    ]);
    const agent = await signIn(app, googleIdentityVerifier, 'g-jonny');

    const response = await agent.post('/plaid/exchange').send({ publicToken: 'public-token' });
    expect(response.status).toBe(201);
    expect(response.body.accounts).toHaveLength(1);
    expect(response.body.accounts[0]).toMatchObject({ isManual: false, name: 'Checking' });
  });

  it('a user cannot disconnect another tenant\'s item', async () => {
    const { app, googleIdentityVerifier, bankingProvider } = buildTestApp();
    bankingProvider.seedExchange('public-token', { accessToken: 'access-token', plaidItemId: 'item-1' });
    bankingProvider.seedAccounts('access-token', []);

    const owner = await signIn(app, googleIdentityVerifier, 'g-owner');
    await owner.post('/plaid/exchange').send({ publicToken: 'public-token' });

    const intruder = await signIn(app, googleIdentityVerifier, 'g-intruder');
    const response = await intruder.post('/plaid/items/item-1/disconnect').send({});
    expect(response.status).toBe(404);
  });

  it('lets the owner disconnect and trigger a sync for their own item', async () => {
    const { app, googleIdentityVerifier, bankingProvider } = buildTestApp();
    bankingProvider.seedExchange('public-token', { accessToken: 'access-token', plaidItemId: 'item-1' });
    bankingProvider.seedAccounts('access-token', []);

    const owner = await signIn(app, googleIdentityVerifier, 'g-owner');
    await owner.post('/plaid/exchange').send({ publicToken: 'public-token' });

    const syncResponse = await owner.post('/plaid/items/item-1/sync').send({});
    expect(syncResponse.status).toBe(202);

    const disconnectResponse = await owner.post('/plaid/items/item-1/disconnect').send({});
    expect(disconnectResponse.status).toBe(204);
  });
});
