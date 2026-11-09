import { z } from 'zod';

const booleanString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  WORKER_PORT: z.coerce.number().int().positive().default(3002),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  DYNAMODB_ENDPOINT: z.string().url(),
  DYNAMODB_REGION: z.string().min(1).default('local'),
  DYNAMODB_TABLE_NAME: z.string().min(1).default('quidsin'),
  AWS_ACCESS_KEY_ID: z.string().min(1).default('local'),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).default('local'),

  SESSION_DURATION_HOURS: z.coerce.number().int().positive().default(168),
  SESSION_COOKIE_SECURE: booleanString('false'),

  GOOGLE_CLIENT_ID: z.string().min(1),

  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  PLAID_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PLAID_COUNTRY_CODES: z.string().min(1).default('GB'),
  // An unset env var is undefined, but a `KEY=` line in a .env file (as in
  // .env.example) sets it to an empty string — treat both as "absent".
  PLAID_WEBHOOK_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine(
      (value) => Buffer.from(value, 'base64').length === 32,
      'ENCRYPTION_KEY must be a base64-encoded 32-byte key — generate one with `openssl rand -base64 32`',
    ),
  QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  QUEUE_LEASE_DURATION_MS: z.coerce.number().int().positive().default(60000),
});

export type Config = z.infer<typeof configSchema>;
