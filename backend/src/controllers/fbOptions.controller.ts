import type { Request, Response } from 'express';
import { z } from 'zod';
import { FACEBOOK_ACCESS_GROUPS } from '../models/adAccess.model.js';
import { facebookAdScope } from '../services/access.service.js';
import { getFbOptions } from '../services/fbOptions.service.js';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const querySchema = z.object({
  group: z.preprocess(emptyToUndefined, z.enum(FACEBOOK_ACCESS_GROUPS).optional()),
});

/**
 * GET /api/platforms/facebook/options?group=Meta1 — filter choices (ads, offers, providers, date ranges)
 * from the report collection, limited to the ads the caller may see (and to one group's ads when given)
 */
export async function getOptions(req: Request, res: Response): Promise<void> {
  const { group } = querySchema.parse(req.query);
  res.json(await getFbOptions(await facebookAdScope(req.user!, group)));
}
