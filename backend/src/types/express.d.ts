import type { AuthUser } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth after the Bearer token is verified. */
      user?: AuthUser;
    }
  }
}

export {};
