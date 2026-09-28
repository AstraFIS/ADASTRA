import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { login, me } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
});

authRouter.post('/login', loginLimiter, login);
authRouter.get('/me', requireAuth, me);
