import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { adAccessRouter } from './adAccess.routes.js';
import { authRouter } from './auth.routes.js';
import { healthRouter } from './health.routes.js';
import { platformsRouter } from './platforms.routes.js';
import { userRouter } from './user.routes.js';

export const apiRouter = Router();

// public
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

// signed-in users only
apiRouter.use('/users', userRouter);
apiRouter.use('/ad-access', adAccessRouter);
apiRouter.use('/platforms', requireAuth, platformsRouter);
