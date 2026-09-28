import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { USER_ROLES, User, toPublicUser } from '../models/user.model.js';
import { HttpError } from '../utils/httpError.js';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(USER_ROLES).default('user'),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80).optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

function parseId(raw: string | undefined): string {
  if (!raw || !isValidObjectId(raw)) throw new HttpError(404, 'User not found');
  return raw;
}

/** True when `userId` is the only active admin, i.e. removing their access would lock everyone out. */
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const others = await User.countDocuments({ _id: { $ne: userId }, role: 'admin', isActive: true });
  return others === 0;
}

/** GET /api/users — admin only */
export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ users: users.map(toPublicUser) });
}

/** GET /api/users/:id — admin only */
export async function getUser(req: Request, res: Response): Promise<void> {
  const user = await User.findById(parseId(req.params.id as string | undefined));
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user: toPublicUser(user) });
}

/** POST /api/users — admin only */
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

/** PATCH /api/users/:id — admin only */
export async function updateUser(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id as string | undefined);
  const input = updateUserSchema.parse(req.body);
  const isSelf = req.user!.id === id;

  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw new HttpError(404, 'User not found');

  const losesAdminAccess =
    user.role === 'admin' &&
    user.isActive &&
    ((input.role !== undefined && input.role !== 'admin') || input.isActive === false);

  if (losesAdminAccess) {
    if (isSelf) throw new HttpError(400, 'You cannot remove your own admin access or deactivate yourself');
    if (await isLastActiveAdmin(id)) throw new HttpError(400, 'This is the last active admin account');
  }

  if (input.email !== undefined && input.email !== user.email) {
    if (await User.exists({ email: input.email, _id: { $ne: id } })) {
      throw new HttpError(409, 'A user with this email already exists');
    }
    user.email = input.email;
  }
  if (input.name !== undefined) user.name = input.name;
  if (input.role !== undefined) user.role = input.role;
  if (input.isActive !== undefined) user.isActive = input.isActive;
  if (input.password !== undefined) user.passwordHash = await User.hashPassword(input.password);

  await user.save();
  res.json({ user: toPublicUser(user) });
}

/** DELETE /api/users/:id — admin only */
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id as string | undefined);
  if (req.user!.id === id) throw new HttpError(400, 'You cannot delete your own account');

  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  if (user.role === 'admin' && user.isActive && (await isLastActiveAdmin(id))) {
    throw new HttpError(400, 'This is the last active admin account');
  }

  await user.deleteOne();
  res.status(204).end();
}
