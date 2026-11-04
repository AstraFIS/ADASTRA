import type { Request, Response } from 'express';
import { z } from 'zod';
import { bumpDataVersion } from '../services/reportCache.service.js';
import { listPartnerOffers, savePartnerOffers } from '../services/partnerOffers.service.js';
import { PARTNER_PLATFORMS } from '../models/partnerOffer.model.js';
import { FACEBOOK_ACCESS_GROUPS } from '../models/adAccess.model.js';
import { TAXONOMY_SOURCES } from '../models/adTaxonomy.model.js';
import {
  listAdAssignments,
  listUnnamedRows,
  saveAdAssignments,
  saveRowGroups,
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

const rowGroupsSchema = z.object({
  items: z
    .array(
      z.object({
        source: z.enum(['facebook', 'partner']),
        ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid row id')).min(1).max(5000),
        group: z.enum(FACEBOOK_ACCESS_GROUPS).nullable(),
      }),
    )
    .min(1)
    .max(500),
});

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
  await bumpDataVersion(); // the dashboards' cached answers depend on the groups
  res.json({ groupsSaved, linksSaved, taxonomiesSaved, ads: await listAdAssignments() });
}

/** GET /api/ad-access/rows — rows without an ad name (and rows with their own group), bucketed by day (admin only) */
export async function getUnnamedRows(_req: Request, res: Response): Promise<void> {
  res.json({ groups: FACEBOOK_ACCESS_GROUPS, rows: await listUnnamedRows() });
}

/** PUT /api/ad-access/rows — set or clear the group stored on those rows (admin only) */
export async function saveUnnamedRows(req: Request, res: Response): Promise<void> {
  const { items } = rowGroupsSchema.parse(req.body);
  const changed = await saveRowGroups(items);
  await bumpDataVersion();
  res.json({ changed, rows: await listUnnamedRows() });
}

const partnerOffersSchema = z.object({
  items: z
    .array(
      z.object({
        platform: z.enum(PARTNER_PLATFORMS),
        offer_name: z.string().trim().min(1).max(300),
        partner_name: z.string().trim().max(120).nullable(),
        partner_login: z.string().trim().max(120).nullable(),
      }),
    )
    .min(1)
    .max(500),
});

/** GET /api/ad-access/partners — every offer with its partner and partner login (admin only) */
export async function getPartnerOffers(_req: Request, res: Response): Promise<void> {
  res.json({ offers: await listPartnerOffers() });
}

/** PUT /api/ad-access/partners — set partner + login per offer; an empty partner removes it (admin only) */
export async function putPartnerOffers(req: Request, res: Response): Promise<void> {
  const { items } = partnerOffersSchema.parse(req.body);
  const saved = await savePartnerOffers(items);
  await bumpDataVersion();
  res.json({ saved, offers: await listPartnerOffers() });
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
