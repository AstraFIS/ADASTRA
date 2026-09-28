import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProd } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (isMongoDuplicateKey(err)) {
    res.status(409).json({ error: 'A record with that value already exists' });
    return;
  }

  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Internal Server Error';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: status >= 500 && isProd ? 'Internal Server Error' : message,
  });
}
