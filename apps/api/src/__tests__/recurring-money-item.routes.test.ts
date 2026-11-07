import { describe, expect, it } from 'vitest';
import request, { type Agent } from 'supertest';
import { buildTestApp } from './build-test-app.js';

async function registeredAgent(
  app: Parameters<typeof request.agent>[0],
  email: string,
): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post('/auth/register').send({ email, password: 'secret123' });
  return agent;
}

describe('/income routes', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    expect((await request(app).get('/income')).status).toBe(401);
  });

  it('supports the full create/list/get/update/deactivate/delete lifecycle', async () => {
    const { app } = buildTestApp();
    const agent = await registeredAgent(app, 'jonny@example.com');

    const created = await agent.post('/income').send({
      name: 'Salary',
      amountMinorUnits: 300_000,
      frequency: 'monthly',
      anchorDate: '2026-01-25',
    });
    expect(created.status).toBe(201);
    const id = created.body.item.id;

    expect((await agent.get('/income')).body.items).toHaveLength(1);
    expect((await agent.get(`/income/${id}`)).body.item.name).toBe('Salary');

    const updated = await agent.patch(`/income/${id}`).send({ name: 'Salary (updated)' });
    expect(updated.body.item.name).toBe('Salary (updated)');

    const deactivated = await agent.post(`/income/${id}/deactivate`);
    expect(deactivated.body.item.active).toBe(false);

    const reactivated = await agent.post(`/income/${id}/reactivate`);
    expect(reactivated.body.item.active).toBe(true);

    expect((await agent.delete(`/income/${id}`)).status).toBe(204);
    expect((await agent.get(`/income/${id}`)).status).toBe(404);
  });

  it('rejects invalid input', async () => {
    const { app } = buildTestApp();
    const agent = await registeredAgent(app, 'jonny@example.com');

    const response = await agent
      .post('/income')
      .send({ name: '', amountMinorUnits: -5, frequency: 'daily' });
    expect(response.status).toBe(400);
  });

  it('isolates records between two different users/tenants', async () => {
    const { app } = buildTestApp();
    const agentA = await registeredAgent(app, 'a@example.com');
    const agentB = await registeredAgent(app, 'b@example.com');

    const created = await agentA.post('/income').send({
      name: 'A-only',
      amountMinorUnits: 100_00,
      frequency: 'monthly',
      anchorDate: '2026-01-01',
    });
    const id = created.body.item.id;

    expect((await agentB.get(`/income/${id}`)).status).toBe(404);
    expect((await agentB.get('/income')).body.items).toHaveLength(0);
  });
});

describe('/expenses routes (shares the same route factory as income)', () => {
  it('supports create and pause without deleting', async () => {
    const { app } = buildTestApp();
    const agent = await registeredAgent(app, 'jonny@example.com');

    const created = await agent.post('/expenses').send({
      name: 'Rent',
      amountMinorUnits: 120_000,
      frequency: 'monthly',
      anchorDate: '2026-01-01',
    });
    expect(created.status).toBe(201);

    const paused = await agent.post(`/expenses/${created.body.item.id}/deactivate`);
    expect(paused.body.item.active).toBe(false);

    // still retrievable — paused, not deleted
    expect((await agent.get(`/expenses/${created.body.item.id}`)).status).toBe(200);
  });
});
