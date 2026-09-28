import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { healthRouter } from './health.routes.js';
import { platformsRouter } from './platforms.routes.js';
import { userRouter } from './user.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/platforms', platformsRouter);
