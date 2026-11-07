import type { ZodSchema } from 'zod';
import { ValidationError } from '@quidsin/core';

export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ValidationError('Validation failed', issues);
  }

  return result.data;
}
