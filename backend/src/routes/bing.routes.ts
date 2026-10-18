import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { getBingDashboard } from '../services/bing.service.js';
import { listCampaignBuyers, saveCampaignBuyers } from '../services/bingCampaignBuyers.service.js';
import { DATE_RANGE_KEYS } from '../types/facebook.js';
import { BING_MEDIA_BUYERS, UNASSIGNED_BUYER, normalizeBuyer } from '../utils/bingBuyer.js';

export const bingRouter = Router();

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const dashboardQuerySchema = z.object({
  range: z.preprocess(emptyToUndefined, z.enum(DATE_RANGE_KEYS).default('all_time')),
  offer: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
  campaign: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
  // custom range, YYYY-MM-DD inclusive
  from: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional()),
  to: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional()),
  // "th02" / "TH2" → "TH2"
  buyer: z.preprocess(
    (v) => {
      const s = emptyToUndefined(v);
      if (typeof s !== 'string') return s;
      return s.trim().toLowerCase() === UNASSIGNED_BUYER.toLowerCase() ? UNASSIGNED_BUYER : (normalizeBuyer(s) ?? s);
    },
    z.enum([...BING_MEDIA_BUYERS, UNASSIGNED_BUYER]).optional(),
  ),
});

/**
 * GET /api/platforms/microsoft/dashboard?range=all_time&offer=…&campaign=…&buyer=TH2  (or from=YYYY-MM-DD&to=YYYY-MM-DD)
 * Bing Ads performance: bing_ad_reports (spend) joined with bing_conversions (partner funnel),
 * plus bing_keyword_reports. Limited to the media buyers the caller may see.
 */
bingRouter.get('/dashboard', async (req, res) => {
  const q = dashboardQuerySchema.parse(req.query);
  if (q.from && q.to && q.from > q.to) throw new HttpError(400, 'from must not be after to');
  res.json(await getBingDashboard({ range: q.range, offer: q.offer, campaign: q.campaign, buyer: q.buyer, from: q.from, to: q.to }, req.user!));
});

/**
 * GET /api/platforms/microsoft/campaign-buyers — admins
 * Every Bing campaign with its media buyer and where that comes from (suffix / manual / keyword report / none).
 */
bingRouter.get('/campaign-buyers', requireRole('admin'), async (_req, res) => {
  res.json(await listCampaignBuyers());
});

const saveBuyersSchema = z.object({
  assignments: z
    .array(
      z.object({
        campaign_name: z.string().trim().min(1).max(300),
        // "TH02" → "TH2"; null removes the manual pick
        media_buyer: z.preprocess((v) => (typeof v === 'string' ? (normalizeBuyer(v) ?? v) : v), z.enum(BING_MEDIA_BUYERS).nullable()),
      }),
    )
    .max(1000),
});

/**
 * PUT /api/platforms/microsoft/campaign-buyers — admins
 * { assignments: [{ campaign_name, media_buyer: "TH" | "TH2" | null }] } for campaigns without a buyer suffix.
 */
bingRouter.put('/campaign-buyers', requireRole('admin'), async (req, res) => {
  const { assignments } = saveBuyersSchema.parse(req.body);
  res.json(await saveCampaignBuyers(assignments));
});
