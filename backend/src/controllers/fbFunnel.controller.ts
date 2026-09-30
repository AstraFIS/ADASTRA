import type { Request, Response } from 'express';
import { facebookAdScope } from '../services/access.service.js';
import { getFbFunnel } from '../services/fbFunnel.service.js';
import { reportQuerySchema } from './fbStatistics.controller.js';

/**
 * GET /api/platforms/facebook/funnel?range=this_month&ad=…&offer=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * "Funnel Performance by Ad Name & Offer": one row per (ad_name, offer_name)
 * with spend, clicks, CTR/CPC (all), the funnel stage counts, revenue, CAC and
 * ROAS, summed over the selected period from the facebook_ad_reports collection.
 */
export async function getFunnel(req: Request, res: Response): Promise<void> {
  const q = reportQuerySchema.parse(req.query);
  res.json(await getFbFunnel({ ...q, allowedAds: await facebookAdScope(req.user!, q.group) }));
}
