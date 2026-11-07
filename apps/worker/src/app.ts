import express, { type Express } from 'express';
import type { HealthStatus } from '@quidsin/shared';

export function createApp(): Express {
  const app = express();

  app.get('/health', (_req, res) => {
    const body: HealthStatus = {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  });

  return app;
}
