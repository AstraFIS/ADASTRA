import { Router } from 'express';
import { createUser } from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const userRouter = Router();

userRouter.post('/', requireAuth, requireRole('admin'), createUser);
