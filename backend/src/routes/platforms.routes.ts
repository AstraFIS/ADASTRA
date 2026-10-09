import { Router } from 'express';
import { requirePlatform } from '../middleware/auth.js';
import { MONTH_RE, getPortfolioOverview } from '../services/platforms.service.js';
import { bingRouter } from './bing.routes.js';
import { facebookRouter } from './facebook.routes.js';

export const platformsRouter = Router();

/** GET /api/platforms/overview?month=YYYY-MM — live totals per platform; no month = the current month. */
platformsRouter.get('/overview', async (req, res) => {
  const month = typeof req.query.month === 'string' && MONTH_RE.test(req.query.month) ? req.query.month : undefined;
  res.json(await getPortfolioOverview(req.user!, month));
});

platformsRouter.use('/facebook', requirePlatform('facebook'), facebookRouter);
platformsRouter.use('/microsoft', requirePlatform('microsoft'), bingRouter);
