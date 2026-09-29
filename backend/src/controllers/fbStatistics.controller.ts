import type { Request, Response } from 'express';
import { z } from 'zod';
import { getFbStatistics } from '../services/fbStatistics.service.js';
import { DATE_RANGE_KEYS } from '../types/facebook.js';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Shared by every endpoint that reads the report collections. */
export const reportQuerySchema = z
  .object({
    range: z.preprocess(emptyToUndefined, z.enum(DATE_RANGE_KEYS).default('this_month')),
    from: z.preprocess(emptyToUndefined, isoDate.optional()),
    to: z.preprocess(emptyToUndefined, isoDate.optional()),
    ad: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
    offer: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, { message: '`from` must not be after `to`', path: ['from'] });

/**`
 * GET /api/platforms/facebook/statistics?range=this_month&ad=…&offer=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Totals from the facebook_ad_reports collection:
 *   total_revenue, total_amount_spend (incl. provider fees), net_profit,
 *   landing_page_views, link_clicks, cpc (spend before fees ÷ link clicks),
 *   ctr (link clicks ÷ impressions, %).
 */
export async function getStatistics(req: Request, res: Response): Promise<void> {
  const q = reportQuerySchema.parse(req.query);
  res.json(await getFbStatistics(q));
}
