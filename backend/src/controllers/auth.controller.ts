import type { Request, Response } from 'express';
import { z } from 'zod';
import { User, toPublicUser } from '../models/user.model.js';
import { HttpError } from '../utils/httpError.js';
import { signToken } from '../utils/jwt.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1, 'Password is required'),
});

const setupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

/** GET /api/auth/status — tells the login page whether the first admin still has to be created. */
export async function status(_req: Request, res: Response): Promise<void> {
  const userCount = await User.estimatedDocumentCount();
  res.json({ needsSetup: userCount === 0 });
}

/**
 * POST /api/auth/setup — creates the first admin account.
 * Only works while there are no users at all; afterwards it always returns 409.
 */
export async function setup(req: Request, res: Response): Promise<void> {
  const input = setupSchema.parse(req.body);

  if ((await User.estimatedDocumentCount()) > 0) {
    throw new HttpError(409, 'Setup has already been completed');
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    role: 'admin',
    passwordHash: await User.hashPassword(input.password),
    lastLoginAt: new Date(),
  });

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.status(201).json({ token, user: toPublicUser(user) });
}

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
