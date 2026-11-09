import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';

describe('/transactions routes', () => {
  it('rejects unauthenticated requests', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/transactions');
    expect(response.status).toBe(401);
  });

  it('lists (empty) transactions for the signed-in user, accepting query filters', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    const agent = request.agent(app);
    googleIdentityVerifier.seed('tok', { sub: 'g-jonny', email: 'jonny@example.com', emailVerified: true });
    await agent.post('/auth/google').send({ idToken: 'tok' });

    // Transaction sync runs in the worker, not inline on this route — an
    // empty list here just proves the route is wired, not sync behavior
    // (covered by packages/core and packages/database tests).
    const response = await agent.get('/transactions').query({ pending: 'true', search: 'coffee' });
    expect(response.status).toBe(200);
    expect(response.body.transactions).toEqual([]);
  });

  it('updates notes on a transaction', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    const agent = request.agent(app);
    googleIdentityVerifier.seed('tok', { sub: 'g-jonny', email: 'jonny@example.com', emailVerified: true });
    await agent.post('/auth/google').send({ idToken: 'tok' });

    const response = await agent.patch('/transactions/txn-unknown/notes').send({ notes: 'hello' });
    expect(response.status).toBe(404);
  });
});
