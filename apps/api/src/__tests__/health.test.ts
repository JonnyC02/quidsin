import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { HealthCheckable } from '@quidsin/database';
import { createApp } from '../app.js';

function buildApp(ping: () => Promise<boolean>) {
  const fakeDatabase: HealthCheckable = { ping };
  return createApp(fakeDatabase);
}

describe('GET /health', () => {
  it('reports ok without checking dependencies', async () => {
    const app = buildApp(() => Promise.reject(new Error('should not be called')));

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('GET /health/ready', () => {
  it('reports ok when the database ping succeeds', async () => {
    const app = buildApp(() => Promise.resolve(true));

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('reports 503 when the database ping fails', async () => {
    const app = buildApp(() => Promise.reject(new Error('unreachable')));

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('error');
  });
});
