import type { Request, Response } from 'express';
import { facebookAdScope } from '../services/access.service.js';
import { getFbDailyTrend } from '../services/fbDailyTrend.service.js';
import { reportQuerySchema } from './fbStatistics.controller.js';

/**
 * GET /api/platforms/facebook/daily-trend?range=this_month&ad=…&offer=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Per-day totals from the facebook_ad_reports collection for the
 * "Revenue vs. Gross Profit — Daily Trend" chart: revenue, spend before / after
 * provider fees, gross and net profit, link clicks, conversions and CAC.
 */
export async function getDailyTrend(req: Request, res: Response): Promise<void> {
  const q = reportQuerySchema.parse(req.query);
  res.json(await getFbDailyTrend({ ...q, allowedAds: await facebookAdScope(req.user!) }));
}
