import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 doesn't forward rejected promises from async handlers to the
 * error middleware on its own — this wrapper does that, so route handlers
 * can simply `await` and `throw` without each one needing its own
 * try/catch calling next(error).
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
