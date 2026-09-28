import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { login, me, setup, status } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in 15 minutes' },
});

authRouter.get('/status', status);
authRouter.post('/setup', credentialLimiter, setup);
authRouter.post('/login', credentialLimiter, login);
authRouter.get('/me', requireAuth, me);
