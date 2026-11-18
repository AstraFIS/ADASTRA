import type { Request, Response } from 'express';
import { z } from 'zod';
import { FACEBOOK_ACCESS_GROUPS } from '../models/adAccess.model.js';
import { facebookScope } from '../services/access.service.js';
import { getFbOptions } from '../services/fbOptions.service.js';
import { providerScope } from '../services/fbStatistics.service.js';
import { oneOrMany } from './fbStatistics.controller.js';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const querySchema = z.object({
  group: z.preprocess(emptyToUndefined, z.enum(FACEBOOK_ACCESS_GROUPS).optional()),
  category: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
  provider: oneOrMany,
});

/**
 * GET /api/platforms/facebook/options?group=Meta1&category=GLP — filter choices (ads, offers, providers, categories, date ranges)
 * from the report collection, limited to the ads the caller may see (and to one group's ads when given)
 */
export async function getOptions(req: Request, res: Response): Promise<void> {
  const { group, category, provider } = querySchema.parse(req.query);
  res.json(await getFbOptions({ ...(await facebookScope(req.user!, group)), category, ...(await providerScope(provider)) }));
}
