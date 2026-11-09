import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('GET /health', () => {
  it('reports ok while the poll loop has polled recently', async () => {
    const app = createApp({ lastPolledAt: () => Date.now(), staleAfterMs: 30_000 });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('reports error once the poll loop has gone stale', async () => {
    const app = createApp({ lastPolledAt: () => Date.now() - 60_000, staleAfterMs: 30_000 });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('error');
  });
});
