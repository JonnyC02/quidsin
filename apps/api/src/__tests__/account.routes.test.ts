import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';

describe('/accounts routes', () => {
  it('creates a manual account and updates its balance separately from other metadata', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok', {
      sub: 'g-jonny',
      email: 'jonny@example.com',
      emailVerified: true,
    });
    const agent = request.agent(app);
    await agent.post('/auth/google').send({ idToken: 'tok' });

    const created = await agent.post('/accounts').send({
      name: 'Current account',
      type: 'current',
      currency: 'GBP',
      balanceMinorUnits: 100_000,
    });
    expect(created.status).toBe(201);
    expect(created.body.account.isManual).toBe(true);

    const balanceUpdate = await agent
      .post(`/accounts/${created.body.account.id}/balance`)
      .send({ balanceMinorUnits: 250_000 });
    expect(balanceUpdate.body.account.balanceMinorUnits).toBe(250_000);
    expect(balanceUpdate.body.account.name).toBe('Current account');
  });

  it('rejects an invalid account type', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok', {
      sub: 'g-jonny',
      email: 'jonny@example.com',
      emailVerified: true,
    });
    const agent = request.agent(app);
    await agent.post('/auth/google').send({ idToken: 'tok' });

    const response = await agent.post('/accounts').send({
      name: 'Current account',
      type: 'not-a-real-type',
      currency: 'GBP',
      balanceMinorUnits: 100_000,
    });
    expect(response.status).toBe(400);
  });
});
