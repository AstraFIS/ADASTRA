import type { Request, Response } from 'express';
import { facebookAdScope } from '../services/access.service.js';
import { getFbGeoDevice } from '../services/fbGeoDevice.service.js';
import { reportQuerySchema } from './fbStatistics.controller.js';

/**
 * GET /api/platforms/facebook/geo-device?range=this_month&ad=…&offer=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The same report rows grouped by their Region (country) and by Device, with
 * delivery, funnel and money totals per segment.
 */
export async function getGeoDevice(req: Request, res: Response): Promise<void> {
  const q = reportQuerySchema.parse(req.query);
  res.json(await getFbGeoDevice({ ...q, allowedAds: await facebookAdScope(req.user!, q.group) }));
}
