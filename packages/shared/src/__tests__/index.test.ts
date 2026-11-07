import { describe, expect, it } from 'vitest';
import type { HealthStatus } from '../index.js';

describe('@quidsin/shared', () => {
  it('exports a HealthStatus shape that can be constructed', () => {
    const status: HealthStatus = {
      status: 'ok',
      uptimeSeconds: 1,
      timestamp: new Date().toISOString(),
    };

    expect(status.status).toBe('ok');
  });
});
