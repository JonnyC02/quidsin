import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfigFromSsm, resetSsmConfigCacheForTests } from '../load-config-from-ssm.js';

const BASE_ENV = {
  NODE_ENV: 'test',
  PORT: '3001',
  WORKER_PORT: '3002',
  DYNAMODB_ENDPOINT: 'http://localhost:8000',
  DYNAMODB_REGION: 'local',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
};

const PARAMETER_NAMES = {
  GOOGLE_CLIENT_ID: '/quidsin/dev/google-client-id',
  PLAID_CLIENT_ID: '/quidsin/dev/plaid-client-id',
  PLAID_SECRET: '/quidsin/dev/plaid-secret',
  ENCRYPTION_KEY: '/quidsin/dev/encryption-key',
};

const ENCRYPTION_KEY_VALUE = Buffer.alloc(32, 7).toString('base64');

function fakeFetchParameters(values: Record<string, string>) {
  return async (names: string[]) => {
    const result: Record<string, string> = {};
    for (const name of names) {
      if (values[name] !== undefined) {
        result[name] = values[name];
      }
    }
    return result;
  };
}

describe('loadConfigFromSsm', () => {
  beforeEach(() => {
    resetSsmConfigCacheForTests();
    for (const [key, value] of Object.entries(BASE_ENV)) {
      vi.stubEnv(key, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('merges fetched secrets with process.env and validates via the same schema loadConfig uses', async () => {
    const fetch = fakeFetchParameters({
      '/quidsin/dev/google-client-id': 'ssm-google-client-id',
      '/quidsin/dev/plaid-client-id': 'ssm-plaid-client-id',
      '/quidsin/dev/plaid-secret': 'ssm-plaid-secret',
      '/quidsin/dev/encryption-key': ENCRYPTION_KEY_VALUE,
    });

    const config = await loadConfigFromSsm(PARAMETER_NAMES, fetch);

    expect(config.GOOGLE_CLIENT_ID).toBe('ssm-google-client-id');
    expect(config.PLAID_SECRET).toBe('ssm-plaid-secret');
    expect(config.ENCRYPTION_KEY).toBe(ENCRYPTION_KEY_VALUE);
    expect(config.DYNAMODB_ENDPOINT).toBe('http://localhost:8000'); // from process.env, not SSM
  });

  it('throws a descriptive error when a named parameter is missing from the fetch result', async () => {
    const fetch = fakeFetchParameters({
      '/quidsin/dev/google-client-id': 'ssm-google-client-id',
      // plaid-client-id, plaid-secret, encryption-key all missing
    });

    await expect(loadConfigFromSsm(PARAMETER_NAMES, fetch)).rejects.toThrow(
      /SSM parameter not found: \/quidsin\/dev\/plaid-client-id/,
    );
  });

  it('propagates the underlying schema validation error for a malformed secret value', async () => {
    const fetch = fakeFetchParameters({
      '/quidsin/dev/google-client-id': 'ssm-google-client-id',
      '/quidsin/dev/plaid-client-id': 'ssm-plaid-client-id',
      '/quidsin/dev/plaid-secret': 'ssm-plaid-secret',
      '/quidsin/dev/encryption-key': 'too-short',
    });

    await expect(loadConfigFromSsm(PARAMETER_NAMES, fetch)).rejects.toThrow(
      /ENCRYPTION_KEY must be a base64-encoded 32-byte key/,
    );
  });

  it('caches the result at module scope — a second call never invokes fetchParameters again', async () => {
    const fetch = vi.fn(
      fakeFetchParameters({
        '/quidsin/dev/google-client-id': 'ssm-google-client-id',
        '/quidsin/dev/plaid-client-id': 'ssm-plaid-client-id',
        '/quidsin/dev/plaid-secret': 'ssm-plaid-secret',
        '/quidsin/dev/encryption-key': ENCRYPTION_KEY_VALUE,
      }),
    );

    await loadConfigFromSsm(PARAMETER_NAMES, fetch);
    await loadConfigFromSsm(PARAMETER_NAMES, fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
