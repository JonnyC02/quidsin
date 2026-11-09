import { Router } from 'express';
import { z } from 'zod';
import type { AccountService, AuthService } from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseOrThrow } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';

const ACCOUNT_TYPES = [
  'current',
  'savings',
  'isa_cash',
  'isa_stocks_and_shares',
  'credit_card',
  'other',
] as const;

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
  institutionName: z.string().min(1).optional(),
  currency: z.string().length(3),
  balanceMinorUnits: z.number().int(),
  description: z.string().optional(),
});

const updateSchema = createSchema.omit({ balanceMinorUnits: true }).partial();

const updateBalanceSchema = z.object({ balanceMinorUnits: z.number().int() });

const updateVisibilitySchema = z.object({
  visibility: z.enum(['private', 'shared', 'tenant']),
  sharedWithUserIds: z.array(z.string()).optional(),
});

export function createAccountRoutes(service: AccountService, authService: AuthService): Router {
  const router = Router();
  router.use(requireAuth(authService));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json({ accounts: await service.list(req.authContext!) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(createSchema, req.body);
      res.status(201).json({ account: await service.create(req.authContext!, input) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json({ account: await service.getById(req.authContext!, req.params.id!) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(updateSchema, req.body);
      res.json({ account: await service.update(req.authContext!, req.params.id!, input) });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await service.remove(req.authContext!, req.params.id!);
      res.status(204).send();
    }),
  );

  router.post(
    '/:id/balance',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(updateBalanceSchema, req.body);
      res.json({
        account: await service.updateBalance(
          req.authContext!,
          req.params.id!,
          input.balanceMinorUnits,
        ),
      });
    }),
  );

  router.post(
    '/:id/visibility',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(updateVisibilitySchema, req.body);
      res.json({
        account: await service.setVisibility(
          req.authContext!,
          req.params.id!,
          input.visibility,
          input.sharedWithUserIds,
        ),
      });
    }),
  );

  return router;
}
