import { Router } from 'express';
import { z } from 'zod';
import {
  FREQUENCIES,
  type AuthService,
  type Frequency,
  type RecurringMoneyItemService,
  type RecurringMoneyItem,
} from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseOrThrow } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';

const createSchema = z.object({
  name: z.string().min(1),
  amountMinorUnits: z.number().int().positive(),
  frequency: z.enum(FREQUENCIES as [Frequency, ...Frequency[]]),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)'),
  description: z.string().optional(),
});

const updateSchema = createSchema.partial();

const updateVisibilitySchema = z.object({
  visibility: z.enum(['private', 'shared', 'tenant']),
  sharedWithUserIds: z.array(z.string()).optional(),
});

/**
 * Shared route factory for income and expense — identical shape in Phase
 * 2. Mounted at /income and /expenses with their respective services.
 */
export function createRecurringMoneyItemRoutes<T extends RecurringMoneyItem>(
  service: RecurringMoneyItemService<T>,
  authService: AuthService,
): Router {
  const router = Router();
  router.use(requireAuth(authService));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json({ items: await service.list(req.authContext!) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(createSchema, req.body);
      res.status(201).json({ item: await service.create(req.authContext!, input) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json({ item: await service.getById(req.authContext!, req.params.id!) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(updateSchema, req.body);
      res.json({ item: await service.update(req.authContext!, req.params.id!, input) });
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
    '/:id/deactivate',
    asyncHandler(async (req, res) => {
      res.json({ item: await service.setActive(req.authContext!, req.params.id!, false) });
    }),
  );

  router.post(
    '/:id/reactivate',
    asyncHandler(async (req, res) => {
      res.json({ item: await service.setActive(req.authContext!, req.params.id!, true) });
    }),
  );

  router.post(
    '/:id/visibility',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(updateVisibilitySchema, req.body);
      res.json({
        item: await service.setVisibility(
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
