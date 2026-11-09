import { Router } from 'express';
import { z } from 'zod';
import type { AuthService, TenantRepository } from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseOrThrow } from '../middleware/validate.js';
import { requireAuth, SESSION_COOKIE_NAME } from '../middleware/require-auth.js';

const googleSignInSchema = z.object({ idToken: z.string().min(1) });

export interface AuthRoutesDeps {
  authService: AuthService;
  tenantRepository: TenantRepository;
  sessionCookieSecure: boolean;
}

function toUserResponse(user: { id: string; email: string; name?: string; tenantId: string }) {
  return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
}

export function createAuthRoutes(deps: AuthRoutesDeps): Router {
  const router = Router();

  function setSessionCookie(res: import('express').Response, sessionId: string, expiresAt: string) {
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: deps.sessionCookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: new Date(expiresAt),
    });
  }

  router.post(
    '/google',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(googleSignInSchema, req.body);
      const { user, sessionId, expiresAt } = await deps.authService.signInWithGoogle(input.idToken);
      setSessionCookie(res, sessionId, expiresAt);
      res.status(200).json({ user: toUserResponse(user) });
    }),
  );

  router.get(
    '/me',
    requireAuth(deps.authService),
    asyncHandler(async (req, res) => {
      const ctx = req.authContext!;
      const tenant = await deps.tenantRepository.findById(ctx.tenantId);
      res.json({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        tenantName: tenant?.name,
        role: ctx.role,
      });
    }),
  );

  router.post(
    '/logout',
    requireAuth(deps.authService),
    asyncHandler(async (req, res) => {
      const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
      if (sessionId) {
        await deps.authService.logout(sessionId);
      }
      res.clearCookie(SESSION_COOKIE_NAME);
      res.status(204).send();
    }),
  );

  router.delete(
    '/account',
    requireAuth(deps.authService),
    asyncHandler(async (req, res) => {
      await deps.authService.deleteAccount(req.authContext!);
      res.clearCookie(SESSION_COOKIE_NAME);
      res.status(204).send();
    }),
  );

  return router;
}
