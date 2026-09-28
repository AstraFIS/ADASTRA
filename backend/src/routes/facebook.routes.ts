import { Router } from 'express';
import { z } from 'zod';
import { getCharts } from '../controllers/fbCharts.controller.js';
import { getDailyTrend } from '../controllers/fbDailyTrend.controller.js';
import { getFunnel } from '../controllers/fbFunnel.controller.js';
import { getStatistics } from '../controllers/fbStatistics.controller.js';
import { getFacebookAdDetail, getFacebookDashboard } from '../services/facebook.service.js';
import { DATE_RANGE_KEYS } from '../types/facebook.js';
import { HttpError } from '../utils/httpError.js';

export const facebookRouter = Router();

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const rangeSchema = z.preprocess(emptyToUndefined, z.enum(DATE_RANGE_KEYS).default('this_month'));

const dashboardQuerySchema = z.object({
  range: rangeSchema,
  ad: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  offer: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
});

/** GET /api/platforms/facebook/statistics — KPIs computed from the facebook_ad_reports collection */
facebookRouter.get('/statistics', getStatistics);

/** GET /api/platforms/facebook/charts — by-ad revenue/spend + audience buckets from the report collections */
facebookRouter.get('/charts', getCharts);

/** GET /api/platforms/facebook/daily-trend — per-day revenue / spend / profit from the report collection */
facebookRouter.get('/daily-trend', getDailyTrend);

/** GET /api/platforms/facebook/funnel — one row per ad × offer with funnel stage counts */
facebookRouter.get('/funnel', getFunnel);

/** GET /api/platforms/facebook/dashboard?range=this_month&ad=...&offer=... */
facebookRouter.get('/dashboard', (req, res) => {
  const q = dashboardQuerySchema.parse(req.query);
  res.json(getFacebookDashboard({ dateRange: q.range, ad: q.ad, offer: q.offer }));
});

const adParamsSchema = z.object({ adName: z.string().trim().min(1).max(120) });
const adQuerySchema = z.object({ range: rangeSchema });

/** GET /api/platforms/facebook/ads/:adName?range=this_month */
facebookRouter.get('/ads/:adName', (req, res) => {
  const { adName } = adParamsSchema.parse(req.params);
  const { range } = adQuerySchema.parse(req.query);
  const detail = getFacebookAdDetail(adName, range);
  if (!detail) throw new HttpError(404, `Unknown ad: ${adName}`);
  res.json(detail);
});
