import { z } from 'zod';

const booleanString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

const baseConfigSchema = z.object({
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

  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  PASSWORD_RESET_BASE_URL: z.string().url().default('http://localhost:5173/reset-password'),

  NOTIFIER_DRIVER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: booleanString('false'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM_ADDRESS: z.string().email().optional(),
});

export const configSchema = baseConfigSchema.superRefine((config, ctx) => {
  if (config.NOTIFIER_DRIVER !== 'smtp') {
    return;
  }

  const requiredWhenSmtp: Array<keyof typeof config> = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM_ADDRESS',
  ];

  for (const key of requiredWhenSmtp) {
    if (config[key] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when NOTIFIER_DRIVER=smtp`,
      });
    }
  }
});

export type Config = z.infer<typeof configSchema>;
