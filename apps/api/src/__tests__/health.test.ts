import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';

describe('GET /health', () => {
  it('reports ok without checking dependencies', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('GET /health/ready', () => {
  it('reports ok when the database ping succeeds', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('reports 503 when the database ping fails', async () => {
    const { app } = buildTestApp({ databaseHealthy: false });
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('error');
  });
});
