import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthContext, AuthService } from '@quidsin/core';

export const SESSION_COOKIE_NAME = 'qsid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export function requireAuth(authService: AuthService): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sessionId) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not logged in' } });
      return;
    }

    const authContext = await authService.validateSession(sessionId);

    if (!authContext) {
      res.clearCookie(SESSION_COOKIE_NAME);
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Session expired' } });
      return;
    }

    req.authContext = authContext;
    next();
  };
}
