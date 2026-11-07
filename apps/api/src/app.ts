import express, { type Express } from 'express';
import type { HealthCheckable } from '@quidsin/database';
import type { HealthStatus } from '@quidsin/shared';

export function createApp(database: HealthCheckable): Express {
  const app = express();

  app.get('/health', (_req, res) => {
    const body: HealthStatus = {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await database.ping();
      const body: HealthStatus = {
        status: 'ok',
        uptimeSeconds: process.uptime(),
        timestamp: new Date().toISOString(),
      };
      res.json(body);
    } catch {
      const body: HealthStatus = {
        status: 'error',
        uptimeSeconds: process.uptime(),
        timestamp: new Date().toISOString(),
      };
      res.status(503).json(body);
    }
  });

  return app;
}
