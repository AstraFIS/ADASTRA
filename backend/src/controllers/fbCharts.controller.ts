import type { Request, Response } from 'express';
import { facebookAdScope } from '../services/access.service.js';
import { getFbCharts } from '../services/fbCharts.service.js';
import { reportQuerySchema } from './fbStatistics.controller.js';

/**
 * GET /api/platforms/facebook/charts?range=this_month&ad=…&offer=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Chart data from the report collections:
 *   revenue_vs_spend_by_ad  — per ad: revenue, total spend (incl. fees), spend, link clicks
 *   audience_by_age         — link clicks / impressions per age band
 *   audience_by_gender      — link clicks / impressions per gender
 */
export async function getCharts(req: Request, res: Response): Promise<void> {
  const q = reportQuerySchema.parse(req.query);
  res.json(await getFbCharts({ ...q, allowedAds: await facebookAdScope(req.user!, q.group) }));
}
