import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';

/** An ISO date `daysFromNow` days from today, so the test doesn't depend on wall-clock date. */
function isoDateIn(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

describe('GET /dashboard', () => {
  it('reports an empty summary for a brand-new user', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok', {
      sub: 'g-jonny',
      email: 'jonny@example.com',
      emailVerified: true,
    });
    const agent = request.agent(app);
    await agent.post('/auth/google').send({ idToken: 'tok' });

    const response = await agent.get('/dashboard');
    expect(response.status).toBe(200);
    expect(response.body.isEmpty).toBe(true);
  });

  it('computes totals and remaining income across income and expenses', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    googleIdentityVerifier.seed('tok', {
      sub: 'g-jonny',
      email: 'jonny@example.com',
      emailVerified: true,
    });
    const agent = request.agent(app);
    await agent.post('/auth/google').send({ idToken: 'tok' });

    await agent.post('/income').send({
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: isoDateIn(20),
    });
    await agent.post('/expenses').send({
      name: 'Rent',
      amountMinorUnits: 120_000,
      frequency: 'monthly',
      anchorDate: isoDateIn(5),
    });

    const response = await agent.get('/dashboard');
    expect(response.body.isEmpty).toBe(false);
    expect(response.body.monthlyIncomeTotalMinorUnits).toBe(300_000);
    expect(response.body.monthlyExpensesTotalMinorUnits).toBe(120_000);
    expect(response.body.remainingMonthlyIncomeMinorUnits).toBe(180_000);
    expect(response.body.upcomingPayments[0].name).toBe('Rent');
  });

  it('requires authentication', async () => {
    const { app } = buildTestApp();
    expect((await request(app).get('/dashboard')).status).toBe(401);
  });
});
