import { Router } from 'express';
import type { AuthService, DashboardService } from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';

export function createDashboardRoutes(service: DashboardService, authService: AuthService): Router {
  const router = Router();
  router.use(requireAuth(authService));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await service.getSummary(req.authContext!));
    }),
  );

  return router;
}
