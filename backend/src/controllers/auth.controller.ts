import type { Request, Response } from 'express';
import { z } from 'zod';
import { User, toPublicUser } from '../models/user.model.js';
import { HttpError } from '../utils/httpError.js';
import { signToken } from '../utils/jwt.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1, 'Password is required'),
});

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);

  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password so we don't leak which emails exist.
  if (!user || !(await user.comparePassword(password))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (!user.isActive) {
    throw new HttpError(403, 'This account has been deactivated');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({ token, user: toPublicUser(user) });
}

/** GET /api/auth/me — requires auth */
export async function me(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  res.json({ user: toPublicUser(user) });
}
