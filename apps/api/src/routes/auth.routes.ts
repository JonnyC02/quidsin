import { Router } from 'express';
import { z } from 'zod';
import type { AuthService } from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseOrThrow } from '../middleware/validate.js';
import { requireAuth, SESSION_COOKIE_NAME } from '../middleware/require-auth.js';

const googleSignInSchema = z.object({ idToken: z.string().min(1) });

export interface AuthRoutesDeps {
  authService: AuthService;
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

  router.get(
    '/me',
    requireAuth(deps.authService),
    asyncHandler(async (req, res) => {
      // authContext only carries ids; re-resolve nothing more is needed
      // here since the frontend only needs to know it's authenticated and
      // which tenant it's scoped to.
      res.json({ userId: req.authContext!.userId, tenantId: req.authContext!.tenantId });
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
