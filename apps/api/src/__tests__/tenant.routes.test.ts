import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './build-test-app.js';
import type { FakeGoogleIdentityVerifier } from './fakes.js';

async function signIn(
  app: Parameters<typeof request.agent>[0],
  googleIdentityVerifier: FakeGoogleIdentityVerifier,
  sub: string,
  email: string,
) {
  const agent = request.agent(app);
  googleIdentityVerifier.seed(`tok-${sub}`, { sub, email, emailVerified: true, name: sub });
  const response = await agent.post('/auth/google').send({ idToken: `tok-${sub}` });
  return { agent, tenantId: response.body.user.tenantId as string };
}

describe('/tenants routes', () => {
  it('rejects unauthenticated requests', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/tenants/members');
    expect(response.status).toBe(401);
  });

  it('a full invite -> accept -> member flow across two signed-in users', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    const owner = await signIn(app, googleIdentityVerifier, 'owner-sub', 'owner@example.com');
    const partner = await signIn(app, googleIdentityVerifier, 'partner-sub', 'partner@example.com');

    const inviteResponse = await owner.agent
      .post('/tenants/invites')
      .send({ email: 'partner@example.com' });
    expect(inviteResponse.status).toBe(201);
    const inviteId = inviteResponse.body.invite.id as string;

    const pendingResponse = await partner.agent.get('/tenants/invites/pending');
    expect(pendingResponse.body.invites).toHaveLength(1);
    expect(pendingResponse.body.invites[0].id).toBe(inviteId);

    const acceptResponse = await partner.agent.post(
      `/tenants/invites/${owner.tenantId}/${inviteId}/accept`,
    );
    expect(acceptResponse.status).toBe(204);

    const membersResponse = await owner.agent.get('/tenants/members');
    expect(membersResponse.body.members.map((m: { email: string }) => m.email)).toContain(
      'partner@example.com',
    );
  });

  it('a non-owner cannot invite, remove members, or read the audit log (403)', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    const owner = await signIn(app, googleIdentityVerifier, 'owner-sub', 'owner@example.com');
    const partner = await signIn(app, googleIdentityVerifier, 'partner-sub', 'partner@example.com');

    const invite = await owner.agent.post('/tenants/invites').send({ email: 'partner@example.com' });
    await partner.agent.post(`/tenants/invites/${owner.tenantId}/${invite.body.invite.id}/accept`);

    // Switch the partner into the owner's tenant to act as a Member there.
    await partner.agent.post(`/tenants/${owner.tenantId}/switch`);

    const inviteAttempt = await partner.agent
      .post('/tenants/invites')
      .send({ email: 'someone-else@example.com' });
    expect(inviteAttempt.status).toBe(403);

    const auditAttempt = await partner.agent.get('/tenants/audit-log');
    expect(auditAttempt.status).toBe(403);
  });

  it('switching tenants changes which tenant subsequent requests act on', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    const owner = await signIn(app, googleIdentityVerifier, 'owner-sub', 'owner@example.com');
    const partner = await signIn(app, googleIdentityVerifier, 'partner-sub', 'partner@example.com');

    const invite = await owner.agent.post('/tenants/invites').send({ email: 'partner@example.com' });
    await partner.agent.post(`/tenants/invites/${owner.tenantId}/${invite.body.invite.id}/accept`);

    const beforeSwitch = await partner.agent.get('/auth/me');
    expect(beforeSwitch.body.tenantId).toBe(partner.tenantId);

    const switchResponse = await partner.agent.post(`/tenants/${owner.tenantId}/switch`);
    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.role).toBe('member');

    const afterSwitch = await partner.agent.get('/auth/me');
    expect(afterSwitch.body.tenantId).toBe(owner.tenantId);
    expect(afterSwitch.body.role).toBe('member');
  });

  it('rejects switching to a tenant the caller is not a member of', async () => {
    const { app, googleIdentityVerifier } = buildTestApp();
    const owner = await signIn(app, googleIdentityVerifier, 'owner-sub', 'owner@example.com');
    const stranger = await signIn(app, googleIdentityVerifier, 'stranger-sub', 'stranger@example.com');

    const response = await stranger.agent.post(`/tenants/${owner.tenantId}/switch`);
    expect(response.status).toBe(404);
  });
});
