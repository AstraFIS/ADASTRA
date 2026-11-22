import type { Request, Response } from 'express';
import { facebookScope } from '../services/access.service.js';
import { getFbInsights } from '../services/fbInsights.service.js';
import { providerScope } from '../services/fbStatistics.service.js';
import { reportQuerySchema } from './fbStatistics.controller.js';

/**
 * GET /api/platforms/facebook/insights?range=all_time&category=…&provider=…&account=…&group=…
 *
 * Creative insights computed live from the report collections: verdict per creative,
 * decisions for new creatives, what traits win, budget / timing, funnel, campaigns,
 * audience, devices and regions. Same filters as every other Facebook endpoint.
 */
export async function getInsights(req: Request, res: Response): Promise<void> {
  const q = reportQuerySchema.parse(req.query);
  res.json(await getFbInsights({ ...q, ...(await facebookScope(req.user!, q.group)), ...(await providerScope(q.provider, q.account)) }));
}
