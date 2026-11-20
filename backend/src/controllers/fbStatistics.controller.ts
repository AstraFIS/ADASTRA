import type { Request, Response } from 'express';
import { z } from 'zod';
import { facebookScope } from '../services/access.service.js';
import { CATEGORIES, getFbStatistics, providerScope } from '../services/fbStatistics.service.js';
import { FACEBOOK_ACCESS_GROUPS } from '../models/adAccess.model.js';
import { DATE_RANGE_KEYS } from '../types/facebook.js';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** ?ad=a or ?ad=a&ad=b → 'a' or ['a', 'b'] (blank values dropped; nothing left → no filter). */
export const oneOrMany = z.preprocess(
  (v) => {
    const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x.trim() !== '');
    if (list.length === 0) return undefined;
    return list.length === 1 ? list[0] : list;
  },
  z.union([z.string().trim().max(200), z.array(z.string().trim().max(200)).max(500)]).optional(),
);
/** Same for a fixed set of values (?group=Meta1&group=Meta2). */
export const someOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => {
      const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x.trim() !== '');
      return list.length === 0 ? undefined : list;
    },
    z.array(z.enum(values)).max(values.length * 2).optional(),
  );

/** Shared by every endpoint that reads the report collections. */
export const reportQuerySchema = z
  .object({
    range: z.preprocess(emptyToUndefined, z.enum(DATE_RANGE_KEYS).default('this_month')),
    from: z.preprocess(emptyToUndefined, isoDate.optional()),
    to: z.preprocess(emptyToUndefined, isoDate.optional()),
    ad: oneOrMany,
    offer: oneOrMany,
    /** ED / GLP / Other (from the offer and ad names). */
    category: someOf(CATEGORIES),
    /** Only this ad platform provider. */
    provider: oneOrMany,
    /** Single ad accounts within a provider ("Provider||Account"). */
    account: oneOrMany,
    /** Meta1 / Meta2: only that ad_access group's ads. */
    group: someOf(FACEBOOK_ACCESS_GROUPS),
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
  res.json(await getFbStatistics({ ...q, ...(await facebookScope(req.user!, q.group)), ...(await providerScope(q.provider, q.account)) }));
}
