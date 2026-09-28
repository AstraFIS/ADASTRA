import type { Request, Response } from 'express';
import { z } from 'zod';
import { USER_ROLES, User, toPublicUser } from '../models/user.model.js';
import { HttpError } from '../utils/httpError.js';

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(USER_ROLES).default('user'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** POST /api/users — requires an admin */
export async function createUser(req: Request, res: Response): Promise<void> {
  const input = createUserSchema.parse(req.body);

  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'A user with this email already exists');
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    role: input.role,
    passwordHash: await User.hashPassword(input.password),
  });

  res.status(201).json({ user: toPublicUser(user) });
}
