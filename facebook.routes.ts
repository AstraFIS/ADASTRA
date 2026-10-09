import { Router } from 'express';
import { z } from 'zod';
import { getAdStatistics } from '../controllers/fbAdStatistics.controller.js';
import { getCharts } from '../controllers/fbCharts.controller.js';
import { getGeoDevice } from '../controllers/fbGeoDevice.controller.js';
import { getDailyTrend } from '../controllers/fbDailyTrend.controller.js';
import { getFunnel } from '../controllers/fbFunnel.controller.js';
import { getOptions } from '../controllers/fbOptions.controller.js';
import { getStatistics } from '../controllers/fbStatistics.controller.js';
import { getAdLinks, getAdTaxonomy } from '../services/adAccessAdmin.service.js';
import { facebookAdScope } from '../services/access.service.js';
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

/** GET /api/platforms/facebook/geo-device — totals per Region (country) and per Device */
facebookRouter.get('/geo-device', getGeoDevice);

/** GET /api/platforms/facebook/daily-trend — per-day revenue / spend / profit from the report collection */
facebookRouter.get('/daily-trend', getDailyTrend);

/** GET /api/platforms/facebook/funnel — one row per ad × offer with funnel stage counts */
facebookRouter.get('/funnel', getFunnel);

/** GET /api/platforms/facebook/options — dropdown choices from the report collection */
facebookRouter.get('/options', getOptions);

/** GET /api/platforms/facebook/dashboard?range=this_month&ad=...&offer=... */
facebookRouter.get('/dashboard', async (req, res) => {
  const q = dashboardQuerySchema.parse(req.query);
  const dashboard = getFacebookDashboard({ dateRange: q.range, ad: q.ad, offer: q.offer });
  const allowedAds = await facebookAdScope(req.user!);
  if (allowedAds) {
    // only list / break down the ads the caller's ad_access groups cover
    dashboard.filters.options.ads = dashboard.filters.options.ads.filter((a) => allowedAds.includes(a));
    dashboard.byAd = dashboard.byAd.filter((a) => allowedAds.includes(a.adName));
  }
  res.json(dashboard);
});

const adParamsSchema = z.object({ adName: z.string().trim().min(1).max(120) });
const adQuerySchema = z.object({ range: rangeSchema });

/** GET /api/platforms/facebook/ads/:adName/statistics — one ad's KPIs from the report collection */
facebookRouter.get('/ads/:adName/statistics', getAdStatistics);

/** GET /api/platforms/facebook/ads/:adName/creative — links saved on the Ad groups page (override creatives.json) */
facebookRouter.get('/ads/:adName/creative', async (req, res) => {
  const { adName } = adParamsSchema.parse(req.params);
  const allowedAds = await facebookAdScope(req.user!);
  if (allowedAds && !allowedAds.includes(adName)) throw new HttpError(404, `Unknown ad: ${adName}`);
  res.json(await getAdLinks(adName));
});

/** GET /api/platforms/facebook/ads/:adName/taxonomy — taxonomy saved on the Ad groups page (overrides data.json); null when none */
facebookRouter.get('/ads/:adName/taxonomy', async (req, res) => {
  const { adName } = adParamsSchema.parse(req.params);
  const allowedAds = await facebookAdScope(req.user!);
  if (allowedAds && !allowedAds.includes(adName)) throw new HttpError(404, `Unknown ad: ${adName}`);
  res.json({ taxonomy: await getAdTaxonomy(adName) });
});

/** GET /api/platforms/facebook/ads/:adName?range=this_month */
facebookRouter.get('/ads/:adName', async (req, res) => {
  const { adName } = adParamsSchema.parse(req.params);
  const { range } = adQuerySchema.parse(req.query);
  const allowedAds = await facebookAdScope(req.user!);
  // an ad outside the caller's access is reported as unknown
  const detail = !allowedAds || allowedAds.includes(adName) ? getFacebookAdDetail(adName, range) : null;
  if (!detail) throw new HttpError(404, `Unknown ad: ${adName}`);
  res.json(detail);
});
