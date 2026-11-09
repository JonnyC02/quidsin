import { Router } from 'express';
import { z } from 'zod';
import type { AuthService, BankConnectionService } from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseOrThrow } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';

const exchangeSchema = z.object({ publicToken: z.string().min(1) });

export function createPlaidRoutes(service: BankConnectionService, authService: AuthService): Router {
  const router = Router();
  router.use(requireAuth(authService));

  router.post(
    '/link-token',
    asyncHandler(async (req, res) => {
      res.json(await service.createLinkToken(req.authContext!));
    }),
  );

  router.post(
    '/exchange',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(exchangeSchema, req.body);
      res.status(201).json(await service.exchangePublicToken(req.authContext!, input.publicToken));
    }),
  );

  router.post(
    '/items/:id/disconnect',
    asyncHandler(async (req, res) => {
      await service.disconnectItem(req.authContext!, req.params.id!);
      res.status(204).send();
    }),
  );

  router.post(
    '/items/:id/sync',
    asyncHandler(async (req, res) => {
      await service.triggerSync(req.authContext!, req.params.id!);
      res.status(202).send();
    }),
  );

  return router;
}
