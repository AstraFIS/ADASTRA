import { Router } from 'express';
import { requirePlatform } from '../middleware/auth.js';
import { getPortfolioOverview } from '../services/platforms.service.js';
import { bingRouter } from './bing.routes.js';
import { facebookRouter } from './facebook.routes.js';

export const platformsRouter = Router();

platformsRouter.get('/overview', (req, res) => {
  res.json(getPortfolioOverview(req.user!.access));
});

platformsRouter.use('/facebook', requirePlatform('facebook'), facebookRouter);
platformsRouter.use('/microsoft', requirePlatform('microsoft'), bingRouter);
