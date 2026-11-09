import express, { Router, type Request } from 'express';
import type { PlaidWebhookService } from '@quidsin/core';
import { asyncHandler } from '../middleware/async-handler.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

const PLAID_VERIFICATION_HEADER = 'plaid-verification';

/**
 * No requireAuth — Plaid calls this directly. Needs the exact raw request
 * body (not the parsed/re-serialized one) to verify the webhook signature,
 * so this router carries its own express.json() with a `verify` hook that
 * captures the raw bytes. It must be mounted before the app-wide
 * express.json() in app.ts, since a request stream can only be read once.
 */
export function createPlaidWebhookRoutes(webhookService: PlaidWebhookService): Router {
  const router = Router();

  router.use(
    express.json({
      verify: (req: Request, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const signatureHeader = req.header(PLAID_VERIFICATION_HEADER);
      const isValid = await webhookService.verifySignature(req.rawBody ?? '', signatureHeader);

      if (!isValid) {
        res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
        return;
      }

      // 200 immediately — the actual sync runs asynchronously in the worker.
      await webhookService.handleWebhookPayload(req.body);
      res.status(200).send();
    }),
  );

  return router;
}
