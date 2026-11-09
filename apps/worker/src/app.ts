import express, { type Express } from 'express';
import type { HealthStatus } from '@quidsin/shared';

export interface PollLoopLiveness {
  /** Timestamp (ms since epoch) of the last completed poll iteration. */
  lastPolledAt: () => number;
  staleAfterMs: number;
}

export function createApp(liveness: PollLoopLiveness): Express {
  const app = express();

  app.get('/health', (_req, res) => {
    const isLive = Date.now() - liveness.lastPolledAt() < liveness.staleAfterMs;
    const body: HealthStatus = {
      status: isLive ? 'ok' : 'error',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    res.status(isLive ? 200 : 503).json(body);
  });

  return app;
}
