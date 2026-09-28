import { Router } from 'express';
import { createUser, deleteUser, getUser, listUsers, updateUser } from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const userRouter = Router();

// every user-management route is admin only
userRouter.use(requireAuth, requireRole('admin'));

userRouter.get('/', listUsers);
userRouter.post('/', createUser);
userRouter.get('/:id', getUser);
userRouter.patch('/:id', updateUser);
userRouter.delete('/:id', deleteUser);
