import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';

const VERIFIED_IDENTITY = {
  sub: 'google-sub-1',
  email: 'jonny@example.com',
  emailVerified: true,
  name: 'Jonny',
};

describe('POST /auth/google', () => {
  it('signs in a new Google account and sets a session cookie', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok-jonny', VERIFIED_IDENTITY);

    const response = await request(app).post('/auth/google').send({ idToken: 'tok-jonny' });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('jonny@example.com');
    expect(response.headers['set-cookie']?.[0]).toMatch(/qsid=/);
  });

  it('returns 400 for a missing idToken', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/auth/google').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for an unrecognized or invalid idToken', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/auth/google').send({ idToken: 'not-seeded' });

    expect(response.status).toBe(401);
  });

  it('returns 401 when the Google email is unverified', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok-unverified', { ...VERIFIED_IDENTITY, emailVerified: false });

    const response = await request(app).post('/auth/google').send({ idToken: 'tok-unverified' });

    expect(response.status).toBe(401);
  });

  it('signing in twice with the same Google sub reuses the same user', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok-jonny', VERIFIED_IDENTITY);

    const first = await request(app).post('/auth/google').send({ idToken: 'tok-jonny' });
    const second = await request(app).post('/auth/google').send({ idToken: 'tok-jonny' });

    expect(first.body.user.id).toBe(second.body.user.id);
    expect(first.body.user.tenantId).toBe(second.body.user.tenantId);
  });
});

describe('authenticated routes', () => {
  it('reject requests with no session cookie', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/auth/me');
    expect(response.status).toBe(401);
  });

  it('allow requests with a valid session cookie', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok-jonny', VERIFIED_IDENTITY);
    const agent = request.agent(app);
    await agent.post('/auth/google').send({ idToken: 'tok-jonny' });

    const response = await agent.get('/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.userId).toBeTruthy();
  });

  it('logout clears the session so the cookie no longer works', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok-jonny', VERIFIED_IDENTITY);
    const agent = request.agent(app);
    await agent.post('/auth/google').send({ idToken: 'tok-jonny' });

    await agent.post('/auth/logout');
    const response = await agent.get('/auth/me');
    expect(response.status).toBe(401);
  });
});

describe('DELETE /auth/account', () => {
  it('deletes the account and allows re-sign-in with the same Google account', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok-jonny', VERIFIED_IDENTITY);
    const agent = request.agent(app);
    const signedIn = await agent.post('/auth/google').send({ idToken: 'tok-jonny' });

    const deleteResponse = await agent.delete('/auth/account');
    expect(deleteResponse.status).toBe(204);

    expect((await agent.get('/auth/me')).status).toBe(401);

    const resignIn = await request(app).post('/auth/google').send({ idToken: 'tok-jonny' });
    expect(resignIn.status).toBe(200);
    expect(resignIn.body.user.id).toBe(signedIn.body.user.id); // same Google sub
    expect(resignIn.body.user.tenantId).not.toBe(signedIn.body.user.tenantId); // fresh tenant
  });
});
