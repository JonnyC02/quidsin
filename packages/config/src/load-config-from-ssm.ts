import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { loadConfig } from './load-config.js';
import type { Config } from './schema.js';

/** Maps a Config key to the SSM parameter name holding its secret value. */
export type SsmParameterMap = Record<string, string>;

export type FetchParameters = (names: string[]) => Promise<Record<string, string>>;

async function defaultFetchParameters(names: string[]): Promise<Record<string, string>> {
  const client = new SSMClient({});
  const result = await client.send(new GetParametersCommand({ Names: names, WithDecryption: true }));

  if (result.InvalidParameters && result.InvalidParameters.length > 0) {
    throw new Error(`Missing SSM parameter(s): ${result.InvalidParameters.join(', ')}`);
  }

  const values: Record<string, string> = {};
  for (const parameter of result.Parameters ?? []) {
    if (parameter.Name && parameter.Value !== undefined) {
      values[parameter.Name] = parameter.Value;
    }
  }
  return values;
}

let cachedConfig: Config | null = null;

/**
 * Loads Config the way the Lambda entrypoints do: everything non-secret
 * comes from plain env vars (as `loadConfig` already handles), but the
 * secret keys named in `parameterNames` are instead fetched — and
 * KMS-decrypted — from SSM Parameter Store at runtime.
 *
 * This exists because CloudFormation's `{{resolve:ssm-secure:...}}`
 * dynamic references resolve to the literal value at deploy time and
 * still end up visible as a plaintext Lambda environment variable —
 * using them would defeat the point of choosing SecureString parameters
 * in the first place. Fetching at runtime, with the execution role
 * granted `ssm:GetParameters` + KMS decrypt, keeps the secret out of the
 * Lambda console and CloudFormation entirely.
 *
 * Cached at module scope: a warm invocation reuses the result from its
 * last cold start instead of re-fetching every time.
 */
export async function loadConfigFromSsm(
  parameterNames: SsmParameterMap,
  fetchParameters: FetchParameters = defaultFetchParameters,
): Promise<Config> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const values = await fetchParameters(Object.values(parameterNames));

  const secrets: Record<string, string> = {};
  for (const [configKey, parameterName] of Object.entries(parameterNames)) {
    const value = values[parameterName];
    if (value === undefined) {
      throw new Error(`SSM parameter not found: ${parameterName} (for ${configKey})`);
    }
    secrets[configKey] = value;
  }

  cachedConfig = loadConfig({ ...process.env, ...secrets });
  return cachedConfig;
}

/** Test-only — clears the module-scope cache between test cases. */
export function resetSsmConfigCacheForTests(): void {
  cachedConfig = null;
}
