import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';

describe('POST /auth/register', () => {
  it('creates a user and sets a session cookie', async () => {
    const { app } = buildTestApp();
    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'jonny@example.com', password: 'secret123' });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('jonny@example.com');
    expect(response.headers['set-cookie']?.[0]).toMatch(/qsid=/);
  });

  it('returns 400 for an invalid payload', async () => {
    const { app } = buildTestApp();
    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 for a duplicate email', async () => {
    const { app } = buildTestApp();
    await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'secret123' });

    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'other12345' });

    expect(response.status).toBe(409);
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials and rejects incorrect ones', async () => {
    const { app } = buildTestApp();
    await request(app)
      .post('/auth/register')
      .send({ email: 'jonny@example.com', password: 'secret123' });

    const good = await request(app)
      .post('/auth/login')
      .send({ email: 'jonny@example.com', password: 'secret123' });
    expect(good.status).toBe(200);

    const bad = await request(app)
      .post('/auth/login')
      .send({ email: 'jonny@example.com', password: 'wrong' });
    expect(bad.status).toBe(401);
  });
});

describe('authenticated routes', () => {
  it('reject requests with no session cookie', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/auth/me');
    expect(response.status).toBe(401);
  });

  it('allow requests with a valid session cookie', async () => {
    const { app } = buildTestApp();
    const agent = request.agent(app);
    await agent.post('/auth/register').send({ email: 'jonny@example.com', password: 'secret123' });

    const response = await agent.get('/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.userId).toBeTruthy();
  });

  it('logout clears the session so the cookie no longer works', async () => {
    const { app } = buildTestApp();
    const agent = request.agent(app);
    await agent.post('/auth/register').send({ email: 'jonny@example.com', password: 'secret123' });

    await agent.post('/auth/logout');
    const response = await agent.get('/auth/me');
    expect(response.status).toBe(401);
  });
});

describe('password reset flow', () => {
  it('requests a reset, confirms it, and logs the user in with the new password', async () => {
    const { app, notifier } = buildTestApp();
    await request(app)
      .post('/auth/register')
      .send({ email: 'jonny@example.com', password: 'secret123' });

    const requestResponse = await request(app)
      .post('/auth/password-reset/request')
      .send({ email: 'jonny@example.com' });
    expect(requestResponse.status).toBe(202);
    expect(notifier.sentEmails).toHaveLength(1);

    const token = new URL(notifier.sentEmails[0]!.resetUrl).searchParams.get('token')!;
    const confirmResponse = await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token, newPassword: 'newpassword456' });
    expect(confirmResponse.status).toBe(204);

    const loginOld = await request(app)
      .post('/auth/login')
      .send({ email: 'jonny@example.com', password: 'secret123' });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app)
      .post('/auth/login')
      .send({ email: 'jonny@example.com', password: 'newpassword456' });
    expect(loginNew.status).toBe(200);
  });

  it('does not reveal whether an email is registered', async () => {
    const { app, notifier } = buildTestApp();
    const response = await request(app)
      .post('/auth/password-reset/request')
      .send({ email: 'unknown@example.com' });

    expect(response.status).toBe(202);
    expect(notifier.sentEmails).toHaveLength(0);
  });
});

describe('DELETE /auth/account', () => {
  it('deletes the account and allows re-registration with the same email', async () => {
    const { app } = buildTestApp();
    const agent = request.agent(app);
    await agent.post('/auth/register').send({ email: 'jonny@example.com', password: 'secret123' });

    const deleteResponse = await agent.delete('/auth/account');
    expect(deleteResponse.status).toBe(204);

    expect((await agent.get('/auth/me')).status).toBe(401);

    const reregister = await request(app)
      .post('/auth/register')
      .send({ email: 'jonny@example.com', password: 'brandnew123' });
    expect(reregister.status).toBe(201);
  });
});
