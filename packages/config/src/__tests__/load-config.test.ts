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

  it('defaults the notifier to console and does not require SMTP vars', () => {
    const config = loadConfig(validEnv);
    expect(config.NOTIFIER_DRIVER).toBe('console');
  });

  it('requires SMTP vars when NOTIFIER_DRIVER=smtp', () => {
    expect(() => loadConfig({ ...validEnv, NOTIFIER_DRIVER: 'smtp' })).toThrow(/SMTP_HOST/);
  });

  it('accepts NOTIFIER_DRIVER=smtp when all SMTP vars are present', () => {
    const config = loadConfig({
      ...validEnv,
      NOTIFIER_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'pass',
      SMTP_FROM_ADDRESS: 'noreply@example.com',
    });

    expect(config.SMTP_HOST).toBe('smtp.example.com');
    expect(config.SMTP_PORT).toBe(587);
  });

  it('parses boolean-string env vars correctly, including the false case', () => {
    const config = loadConfig({ ...validEnv, SESSION_COOKIE_SECURE: 'false' });
    expect(config.SESSION_COOKIE_SECURE).toBe(false);

    const configTrue = loadConfig({ ...validEnv, SESSION_COOKIE_SECURE: 'true' });
    expect(configTrue.SESSION_COOKIE_SECURE).toBe(true);
  });
});
