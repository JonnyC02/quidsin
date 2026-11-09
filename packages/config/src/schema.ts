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
});

export type Config = z.infer<typeof configSchema>;
