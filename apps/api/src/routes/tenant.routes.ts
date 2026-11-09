import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AuthService, TenantMembershipService } from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseOrThrow } from '../middleware/validate.js';
import { requireAuth, SESSION_COOKIE_NAME } from '../middleware/require-auth.js';

const inviteSchema = z.object({ email: z.string().email() });

function sessionId(req: Request): string {
  return req.cookies?.[SESSION_COOKIE_NAME] ?? '';
}

export function createTenantRoutes(service: TenantMembershipService, authService: AuthService): Router {
  const router = Router();
  router.use(requireAuth(authService));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json({ tenants: await service.listMyTenants(req.authContext!) });
    }),
  );

  router.post(
    '/:id/switch',
    asyncHandler(async (req, res) => {
      const ctx = await service.switchTenant(req.authContext!, sessionId(req), req.params.id!);
      res.json({ tenantId: ctx.tenantId, role: ctx.role });
    }),
  );

  router.get(
    '/members',
    asyncHandler(async (req, res) => {
      res.json({ members: await service.listMembers(req.authContext!) });
    }),
  );

  router.delete(
    '/members/:userId',
    asyncHandler(async (req, res) => {
      await service.removeMember(req.authContext!, req.params.userId!);
      res.status(204).send();
    }),
  );

  router.post(
    '/invites',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(inviteSchema, req.body);
      res.status(201).json({ invite: await service.inviteMember(req.authContext!, input.email) });
    }),
  );

  router.get(
    '/invites',
    asyncHandler(async (req, res) => {
      res.json({ invites: await service.listInvites(req.authContext!) });
    }),
  );

  router.get(
    '/invites/pending',
    asyncHandler(async (req, res) => {
      res.json({ invites: await service.listPendingInvitesForCurrentUser(req.authContext!) });
    }),
  );

  router.delete(
    '/invites/:id',
    asyncHandler(async (req, res) => {
      await service.revokeInvite(req.authContext!, req.params.id!);
      res.status(204).send();
    }),
  );

  router.post(
    '/invites/:tenantId/:inviteId/accept',
    asyncHandler(async (req, res) => {
      await service.acceptInvite(req.authContext!, req.params.tenantId!, req.params.inviteId!);
      res.status(204).send();
    }),
  );

  router.post(
    '/invites/:tenantId/:inviteId/decline',
    asyncHandler(async (req, res) => {
      await service.declineInvite(req.authContext!, req.params.tenantId!, req.params.inviteId!);
      res.status(204).send();
    }),
  );

  router.post(
    '/leave',
    asyncHandler(async (req, res) => {
      await service.leaveTenant(req.authContext!, sessionId(req));
      res.status(204).send();
    }),
  );

  router.get(
    '/audit-log',
    asyncHandler(async (req, res) => {
      res.json({ events: await service.listAuditLog(req.authContext!) });
    }),
  );

  return router;
}
