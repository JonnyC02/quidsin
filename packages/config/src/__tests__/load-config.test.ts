import { describe, expect, it } from 'vitest';
import { loadConfig } from '../load-config.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '3001',
  WORKER_PORT: '3002',
  DYNAMODB_ENDPOINT: 'http://localhost:8000',
  DYNAMODB_REGION: 'local',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
};

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig(validEnv);

    expect(config.PORT).toBe(3001);
    expect(config.DYNAMODB_ENDPOINT).toBe('http://localhost:8000');
  });

  it('throws a descriptive error when a required var is missing', () => {
    const { DYNAMODB_ENDPOINT: _omit, ...incomplete } = validEnv;

    expect(() => loadConfig(incomplete)).toThrow(/DYNAMODB_ENDPOINT/);
  });

  it('throws when a value is invalid', () => {
    expect(() => loadConfig({ ...validEnv, DYNAMODB_ENDPOINT: 'not-a-url' })).toThrow();
  });
});
