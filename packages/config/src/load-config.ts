import dotenv from 'dotenv';
import { configSchema, type Config } from './schema.js';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  dotenv.config();

  const result = configSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return result.data;
}
