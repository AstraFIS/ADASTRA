import type { NextFunction, Request, Response } from 'express';
import { User, effectiveAccess, type UserAccess, type UserRole } from '../models/user.model.js';
import { hasPlatformAccess } from '../services/access.service.js';
import type { PlatformId } from '../types/platforms.js';
import { HttpError } from '../utils/httpError.js';
import { verifyToken, type AuthUser } from '../utils/jwt.js';

/** The signed-in caller: token claims plus the access that applies to them right now. */
export interface RequestUser extends AuthUser {
  access: UserAccess;
}

// Adds `req.user` to Express's Request type. It lives here (a module every
// route imports) rather than in a standalone .d.ts so no build can skip it.
declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth after the Bearer token is verified. */
      user?: RequestUser;
    }
  }
}

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
  const user = await User.findById(claims.id).select('role isActive email access');
  if (!user || !user.isActive) {
    return next(new HttpError(401, 'Account not found or deactivated'));
  }

  req.user = { id: user.id, email: user.email, role: user.role, access: effectiveAccess(user) };
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

/** Use after requireAuth. Allows only users whose access list includes the platform. */
export function requirePlatform(platform: PlatformId) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new HttpError(401, 'Authentication required'));
    }
    if (!hasPlatformAccess(req.user.access, platform)) {
      return next(new HttpError(403, 'You do not have access to this platform'));
    }
    next();
  };
}
