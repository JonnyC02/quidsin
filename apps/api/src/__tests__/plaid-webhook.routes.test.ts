import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';

describe('/plaid/webhook route', () => {
  it('rejects a webhook with an invalid signature', async () => {
    const { app, bankingProvider } = buildTestApp();
    bankingProvider.setWebhookSignatureValid(false);

    const response = await request(app)
      .post('/plaid/webhook')
      .send({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-1' });

    expect(response.status).toBe(401);
  });

  it('accepts a webhook with a valid signature', async () => {
    const { app, bankingProvider } = buildTestApp();
    bankingProvider.setWebhookSignatureValid(true);

    const response = await request(app)
      .post('/plaid/webhook')
      .send({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-unknown' });

    expect(response.status).toBe(200);
  });
});
