import type { NextFunction, Request, Response } from 'express';
import { User, type UserRole } from '../models/user.model.js';
import { HttpError } from '../utils/httpError.js';
import { verifyToken } from '../utils/jwt.js';

/** Requires a valid `Authorization: Bearer <token>` header and an active user. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Authentication required'));
  }

  let claims;
  try {
    claims = verifyToken(header.slice('Bearer '.length));
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }

  // Re-check the user so deactivated or deleted accounts lose access immediately.
  const user = await User.findById(claims.id).select('role isActive email');
  if (!user || !user.isActive) {
    return next(new HttpError(401, 'Account not found or deactivated'));
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
}

/** Use after requireAuth. Allows only the given roles. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new HttpError(401, 'Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Insufficient permissions'));
    }
    next();
  };
}
