import { Router } from 'express';
import { z } from 'zod';
import { getBingDashboard } from '../services/bing.service.js';
import { DATE_RANGE_KEYS } from '../types/facebook.js';

export const bingRouter = Router();

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const dashboardQuerySchema = z.object({
  range: z.preprocess(emptyToUndefined, z.enum(DATE_RANGE_KEYS).default('all_time')),
  offer: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
});

/** GET /api/platforms/microsoft/dashboard?range=all_time&offer=... — Bing Ads campaign performance */
bingRouter.get('/dashboard', (req, res) => {
  const q = dashboardQuerySchema.parse(req.query);
  res.json(getBingDashboard({ range: q.range, offer: q.offer }));
});
