import type { Request, Response } from 'express';
import { z } from 'zod';
import { facebookAdScope } from '../services/access.service.js';
import { getFbAdStatistics } from '../services/fbAdStatistics.service.js';
import { HttpError } from '../utils/httpError.js';
import { reportQuerySchema } from './fbStatistics.controller.js';

const paramsSchema = z.object({ adName: z.string().trim().min(1).max(200) });

/**
 * GET /api/platforms/facebook/ads/:adName/statistics?range=this_month&from=&to=
 *
 * One ad's KPIs from the facebook_ad_reports collection — amount_spent,
 * link_clicks, ctr, cpc, cac, roas, revenue — plus the account-wide blended
 * CTR / CPC / CAC for the same range and how the ad compares. 404 if the ad
 * has never reported.
 */
export async function getAdStatistics(req: Request, res: Response): Promise<void> {
  const { adName } = paramsSchema.parse(req.params);
  const q = reportQuerySchema.parse(req.query);
  const result = await getFbAdStatistics(adName, {
    range: q.range,
    from: q.from,
    to: q.to,
    allowedAds: await facebookAdScope(req.user!),
  });
  if (!result) throw new HttpError(404, `Unknown ad: ${adName}`);
  res.json(result);
}
