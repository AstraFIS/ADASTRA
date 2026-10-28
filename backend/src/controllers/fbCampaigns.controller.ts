import type { Request, Response } from 'express';
import { facebookScope } from '../services/access.service.js';
import { getFbCampaigns } from '../services/fbCampaigns.service.js';
import { reportQuerySchema } from './fbStatistics.controller.js';

/**
 * GET /api/platforms/facebook/campaigns?range=this_month&ad=…&offer=…&group=…&from=…&to=…
 *
 * The "By campaign" table: campaign → ad set → ad (with offer), each level with spend,
 * delivery, the partner funnel and revenue. Same filters as the other Facebook endpoints.
 */
export async function getCampaigns(req: Request, res: Response): Promise<void> {
  const q = reportQuerySchema.parse(req.query);
  res.json(await getFbCampaigns({ ...q, ...(await facebookScope(req.user!, q.group)) }));
}
