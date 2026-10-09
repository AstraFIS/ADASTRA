import type { Request, Response } from 'express';
import { z } from 'zod';
import { FACEBOOK_ACCESS_GROUPS } from '../models/adAccess.model.js';
import { TAXONOMY_SOURCES } from '../models/adTaxonomy.model.js';
import {
  listAdAssignments,
  saveAdAssignments,
  saveAdLinks,
  saveAdTaxonomies,
} from '../services/adAccessAdmin.service.js';
import { classifyCreative, isAiConfigured } from '../services/adTaxonomyAi.service.js';
import { taxonomyDataSchema } from '../utils/taxonomySchema.js';

const adName = z.string().trim().min(1).max(200);

// "" = cleared on purpose, null = no override, otherwise an http(s) link
const linkSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must be a full http(s) link')
  .nullable();

const saveSchema = z
  .object({
    assignments: z.array(z.object({ adName, group: z.enum(FACEBOOK_ACCESS_GROUPS).nullable() })).max(2000).default([]),
    links: z.array(z.object({ adName, image: linkSchema, video: linkSchema, landing: linkSchema })).max(2000).default([]),
    // taxonomy: null = remove the saved row (back to frontend/data.json)
    taxonomies: z
      .array(z.object({ adName, taxonomy: taxonomyDataSchema.nullable(), source: z.enum(TAXONOMY_SOURCES) }))
      .max(2000)
      .default([]),
  })
  .refine((v) => v.assignments.length + v.links.length + v.taxonomies.length > 0, { message: 'Nothing to save' });

const classifySchema = z.object({
  ads: z
    .array(
      z.object({
        adName,
        imageUrl: z.string().trim().max(2048).regex(/^https?:\/\/\S+$/i, 'The creative link must be a full http(s) link'),
        landingUrl: z.string().trim().max(2048).nullish(),
      }),
    )
    .min(1)
    .max(5),
});

/** GET /api/ad-access — every ad with its current Meta group and saved links (admin only) */
export async function getAdAccess(_req: Request, res: Response): Promise<void> {
  res.json({ groups: FACEBOOK_ACCESS_GROUPS, ads: await listAdAssignments() });
}

/** PUT /api/ad-access — save groups to ad_access and links to ad_creatives (admin only) */
export async function saveAdAccess(req: Request, res: Response): Promise<void> {
  const { assignments, links, taxonomies } = saveSchema.parse(req.body);
  const [groupsSaved, linksSaved, taxonomiesSaved] = await Promise.all([
    saveAdAssignments(assignments),
    saveAdLinks(links),
    saveAdTaxonomies(taxonomies),
  ]);
  res.json({ groupsSaved, linksSaved, taxonomiesSaved, ads: await listAdAssignments() });
}

/** GET /api/ad-access/ai-status — whether "Classify with AI" is available (admin only) */
export function getAiStatus(_req: Request, res: Response): void {
  res.json({ enabled: isAiConfigured() });
}

/**
 * POST /api/ad-access/classify — suggests a taxonomy for up to 5 ads from their creative image.
 * Nothing is saved: the admin reviews the suggestion and saves it with the rest of the page.
 * One failing ad does not fail the others.
 */
export async function classifyAds(req: Request, res: Response): Promise<void> {
  const { ads } = classifySchema.parse(req.body);
  const results = await Promise.all(
    ads.map(async (ad) => {
      try {
        return { adName: ad.adName, taxonomy: await classifyCreative(ad), error: null };
      } catch (err) {
        return { adName: ad.adName, taxonomy: null, error: err instanceof Error ? err.message : 'Classification failed' };
      }
    }),
  );
  res.json({ results });
}
