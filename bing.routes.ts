import { Router } from 'express';
import { z } from 'zod';
import { getBingDashboard } from '../services/bing.service.js';
import { DATE_RANGE_KEYS } from '../types/facebook.js';

export const bingRouter = Router();

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const dashboardQuerySchema = z.object({
  range: z.preprocess(emptyToUndefined, z.enum(DATE_RANGE_KEYS).default('all_time')),
  offer: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
  campaign: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
});

/**
 * GET /api/platforms/microsoft/dashboard?range=all_time&offer=…&campaign=…
 * Bing Ads performance: bing_ad_reports (spend) joined with bing_conversions (partner funnel).
 */
bingRouter.get('/dashboard', async (req, res) => {
  const q = dashboardQuerySchema.parse(req.query);
  res.json(await getBingDashboard({ range: q.range, offer: q.offer, campaign: q.campaign }));
});
