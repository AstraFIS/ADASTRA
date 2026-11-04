import { Router } from 'express';
import { requirePlatform } from '../middleware/auth.js';
import { MONTH_RE, getPortfolioOverview } from '../services/platforms.service.js';
import { getFinance } from '../services/finance.service.js';
import { cacheReports } from '../services/reportCache.service.js';
import { bingRouter } from './bing.routes.js';
import { facebookRouter } from './facebook.routes.js';

export const platformsRouter = Router();

/** GET /api/platforms/overview?month=YYYY-MM — live totals per platform; no month = the current month. */
platformsRouter.get('/overview', async (req, res) => {
  const month = typeof req.query.month === 'string' && MONTH_RE.test(req.query.month) ? req.query.month : undefined;
  res.json(await getPortfolioOverview(req.user!, month));
});

/** GET /api/platforms/finance?from=YYYY-MM&to=YYYY-MM — cost, revenue and profit by month, fees by provider, profit by offer. */
platformsRouter.get('/finance', cacheReports, async (req, res) => {
  const pick = (v: unknown) => (typeof v === 'string' && MONTH_RE.test(v) ? v : undefined);
  res.json(await getFinance(req.user!, pick(req.query.from), pick(req.query.to)));
});

platformsRouter.use('/facebook', requirePlatform('facebook'), facebookRouter);
platformsRouter.use('/microsoft', requirePlatform('microsoft'), bingRouter);
