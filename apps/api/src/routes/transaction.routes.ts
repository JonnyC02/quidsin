import { Router } from 'express';
import { z } from 'zod';
import type { AuthService, TransactionService } from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseOrThrow } from '../middleware/validate.js';
import { requireAuth } from '../middleware/require-auth.js';

const listQuerySchema = z.object({
  accountId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  pending: z.coerce.boolean().optional(),
});

const updateNotesSchema = z.object({ notes: z.string() });

export function createTransactionRoutes(service: TransactionService, authService: AuthService): Router {
  const router = Router();
  router.use(requireAuth(authService));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const filter = parseOrThrow(listQuerySchema, req.query);
      res.json({ transactions: await service.list(req.authContext!, filter) });
    }),
  );

  router.patch(
    '/:id/notes',
    asyncHandler(async (req, res) => {
      const input = parseOrThrow(updateNotesSchema, req.body);
      res.json({ transaction: await service.updateNotes(req.authContext!, req.params.id!, input.notes) });
    }),
  );

  return router;
}
