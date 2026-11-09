import type { ErrorRequestHandler } from 'express';
import {
  ConflictError,
  ForbiddenError,
  InvalidCredentialsError,
  NotFoundError,
  ValidationError,
} from '@quidsin/core';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: { code: err.code, message: err.message, issues: err.issues } });
    return;
  }

  if (err instanceof InvalidCredentialsError) {
    res.status(401).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ConflictError) {
    res.status(409).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error('[api] Unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};
