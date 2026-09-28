import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '../models/user.model.js';

/** What a verified token tells us about the caller. Attached to req.user. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ email: user.email, role: user.role }, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
  if (!payload.sub || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
    throw new Error('Malformed token payload');
  }
  return { id: payload.sub, email: payload.email, role: payload.role as UserRole };
}
