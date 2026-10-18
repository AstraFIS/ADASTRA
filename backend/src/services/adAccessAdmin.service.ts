import { AdAccess, type FacebookAccessGroup } from '../models/adAccess.model.js';
import { AdCreative } from '../models/adCreative.model.js';
import { AdTaxonomy, type TaxonomyData, type TaxonomySource } from '../models/adTaxonomy.model.js';
import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import { FacebookConversion } from '../models/facebookConversion.model.js';
import { NO_AD_NAME, num, reportAggregate, textValues } from './fbStatistics.service.js';

/** Links saved from the admin page. null = no override; "" = cleared on purpose. */
export interface AdLinks {
  image: string | null;
  video: string | null;
  landing: string | null;
}

export interface AdAssignment {
  adName: string;
  /** null = not in `ad_access`, so hidden from every non-admin. */
  group: FacebookAccessGroup | null;
  /** false when the ad is only in `ad_access` / `ad_creatives` and has no report rows (yet). */
  hasReports: boolean;
  /** Saved overrides only; the frontend merges them over creatives.json. */
  links: AdLinks;
  /** Taxonomy saved from this page (null = none; frontend/data.json is used). */
  taxonomy: SavedTaxonomy | null;
}

export interface SavedTaxonomy extends TaxonomyData {
  source: TaxonomySource;
}

/** taxonomy: null removes the saved row, so the ad falls back to frontend/data.json. */
export interface AdTaxonomyInput {
  adName: string;
  taxonomy: TaxonomyData | null;
  source: TaxonomySource;
}

export interface AdAssignmentInput {
  adName: string;
  group: FacebookAccessGroup | null;
}

export interface AdLinksInput extends AdLinks {
  adName: string;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const NO_LINKS: AdLinks = { image: null, video: null, landing: null };

/**
 * Every ad name found in the report collection, merged with its current row in
 * `ad_access` and `ad_creatives`. Ads that appear only there are included too,
 * so nothing saved earlier disappears from the screen.
 */
export async function listAdAssignments(): Promise<AdAssignment[]> {
  const [reported, accessRows, creativeRows, taxonomyRows] = await Promise.all([
    reportAggregate<{ _id: string | null }>([{ $group: { _id: { $toString: '$ad_name' } } }]),
    AdAccess.find({}, { ad_name: 1, user_access_type: 1, _id: 0 }).lean(),
    AdCreative.find({}).lean(),
    AdTaxonomy.find({}).lean(),
  ]);

  const groupByAd = new Map<string, FacebookAccessGroup>();
  for (const row of accessRows) {
    const name = String(row.ad_name ?? '').trim();
    if (name && !groupByAd.has(name)) groupByAd.set(name, row.user_access_type);
  }

  const linksByAd = new Map<string, AdLinks>();
  for (const row of creativeRows) {
    const name = String(row.ad_name ?? '').trim();
    if (name && !linksByAd.has(name)) {
      linksByAd.set(name, { image: row.image_url ?? null, video: row.video_url ?? null, landing: row.landing_url ?? null });
    }
  }

  const taxonomyByAd = new Map<string, SavedTaxonomy>();
  for (const row of taxonomyRows) {
    const name = String(row.ad_name ?? '').trim();
    if (name && !taxonomyByAd.has(name)) taxonomyByAd.set(name, toSavedTaxonomy(row));
  }

  const reportedNames = new Set(
    // rows without an ad name are grouped row by row (listUnnamedRows), not as one "ad"
    reported.map((r) => (r._id ?? '').trim()).filter((v) => v !== '' && v !== 'null' && v !== NO_AD_NAME),
  );
  const all = new Set([...reportedNames, ...groupByAd.keys(), ...linksByAd.keys(), ...taxonomyByAd.keys()]);

  return [...all].sort(byName).map((adName) => ({
    adName,
    group: groupByAd.get(adName) ?? null,
    hasReports: reportedNames.has(adName),
    links: linksByAd.get(adName) ?? NO_LINKS,
    taxonomy: taxonomyByAd.get(adName) ?? null,
  }));
}

/**
 * Saves the given assignments permanently in `ad_access`. Existing rows for an
 * ad (whether stored as text or as a number, and any duplicates) are replaced
 * by one clean text row; `group: null` just removes the ad's rows.
 */
export async function saveAdAssignments(items: AdAssignmentInput[]): Promise<number> {
  // last entry wins if the same ad is sent twice
  const latest = new Map<string, FacebookAccessGroup | null>();
  for (const item of items) latest.set(item.adName, item.group);
  if (latest.size === 0) return 0;

  const ops: Parameters<typeof AdAccess.bulkWrite>[0] = [];
  for (const [adName, group] of latest) {
    ops.push({ deleteMany: { filter: { ad_name: { $in: textValues(adName) } } } });
    if (group) ops.push({ insertOne: { document: { ad_name: adName, user_access_type: group } } });
  }
  await AdAccess.bulkWrite(ops, { ordered: true });
  return latest.size;
}

/**
 * Saves link overrides in `ad_creatives`: one row per ad, replaced as a whole.
 * An entry with all three links null removes the row (back to creatives.json).
 */
export async function saveAdLinks(items: AdLinksInput[]): Promise<number> {
  const latest = new Map<string, AdLinks>();
  for (const { adName, ...links } of items) latest.set(adName, links);
  if (latest.size === 0) return 0;

  const ops: Parameters<typeof AdCreative.bulkWrite>[0] = [];
  for (const [adName, links] of latest) {
    ops.push({ deleteMany: { filter: { ad_name: { $in: textValues(adName) } } } });
    if (links.image !== null || links.video !== null || links.landing !== null) {
      ops.push({
        insertOne: {
          document: { ad_name: adName, image_url: links.image, video_url: links.video, landing_url: links.landing },
        },
      });
    }
  }
  await AdCreative.bulkWrite(ops, { ordered: true });
  return latest.size;
}

/** One ad's saved link overrides (all null when none), for the ad page. */
export async function getAdLinks(adName: string): Promise<AdLinks> {
  const row = await AdCreative.findOne({ ad_name: adName }).lean();
  return row ? { image: row.image_url ?? null, video: row.video_url ?? null, landing: row.landing_url ?? null } : NO_LINKS;
}

function toSavedTaxonomy(row: {
  confidence_threshold?: number | null;
  intention_message?: unknown;
  physical_execution?: unknown;
  source?: TaxonomySource | null;
}): SavedTaxonomy {
  return {
    ...(typeof row.confidence_threshold === 'number' ? { confidence_threshold: row.confidence_threshold } : {}),
    intention_message: (row.intention_message ?? {}) as TaxonomyData['intention_message'],
    physical_execution: (row.physical_execution ?? {}) as TaxonomyData['physical_execution'],
    source: row.source ?? 'manual',
  };
}

/**
 * Saves creative taxonomy in `ad_taxonomies`: one row per ad, replaced as a
 * whole. `taxonomy: null` removes the row (back to frontend/data.json).
 */
export async function saveAdTaxonomies(items: AdTaxonomyInput[]): Promise<number> {
  const latest = new Map<string, AdTaxonomyInput>();
  for (const item of items) latest.set(item.adName, item);
  if (latest.size === 0) return 0;

  const ops: Parameters<typeof AdTaxonomy.bulkWrite>[0] = [];
  for (const [adName, item] of latest) {
    ops.push({ deleteMany: { filter: { ad_name: { $in: textValues(adName) } } } });
    if (item.taxonomy) {
      ops.push({
        insertOne: {
          document: {
            ad_name: adName,
            ...item.taxonomy,
            source: item.source,
            updated_at: new Date(),
          },
        },
      });
    }
  }
  await AdTaxonomy.bulkWrite(ops, { ordered: true });
  return latest.size;
}

/** One ad's saved taxonomy, or null when none was saved (the ad page then uses data.json). */
export async function getAdTaxonomy(adName: string): Promise<SavedTaxonomy | null> {
  const row = await AdTaxonomy.findOne({ ad_name: adName }).lean();
  return row ? toSavedTaxonomy(row) : null;
}

// ---------------------------------------------------------------------------
// Rows without an ad name: their group is set on the rows themselves
// (access_group), since there is no ad name to look up in ad_access.
// ---------------------------------------------------------------------------

export type RowSource = 'facebook' | 'partner';

/** One day × source × offer bucket of unnamed rows (or rows given a group by hand). */
export interface UnnamedRowBucket {
  key: string;
  source: RowSource;
  date: string | null; // YYYY-MM-DD
  adName: string;
  offer: string | null;
  subIds: string[];
  group: string | null;
  ids: string[];
  rows: number;
  spend: number;
  revenue: number;
  events: number;
  purchases: number;
}

const EVENT_COLUMNS = [
  'presell_visits',
  'first_page_views',
  'questionnaire_starts',
  'questionnaire_completed',
  'add_to_carts',
  'purchase_events',
];

/** Rows without an ad name, plus any row that already has its own group, newest first. */
export async function listUnnamedRows(): Promise<UnnamedRowBucket[]> {
  const rows = await reportAggregate<{
    _id: { source: RowSource; day: Date | null; ad: string; offer: string | null; group: string | null };
    ids: unknown[];
    subIds: (string | null)[];
    rows: number;
    spend: number;
    revenue: number;
    events: number;
    purchases: number;
  }>([
    { $match: { $or: [{ ad_name: NO_AD_NAME }, { access_group: { $nin: [null, ''] } }] } },
    {
      $group: {
        _id: {
          source: { $ifNull: ['$_source', 'facebook'] },
          day: '$report_date',
          ad: { $toString: '$ad_name' },
          offer: { $ifNull: ['$offer_name', null] },
          group: { $ifNull: ['$access_group', null] },
        },
        ids: { $push: '$_id' },
        subIds: { $addToSet: { $ifNull: ['$sub_id', null] } },
        rows: { $sum: 1 },
        spend: { $sum: num('spend_usd') },
        revenue: { $sum: num('revenue_usd') },
        events: { $sum: { $add: EVENT_COLUMNS.map((c) => num(c)) } },
        purchases: { $sum: num('purchase_events') },
      },
    },
    { $sort: { '_id.day': -1, '_id.source': 1 } },
    { $limit: 1000 },
  ]);
  return rows.map((r) => {
    const date = r._id.day instanceof Date ? r._id.day.toISOString().slice(0, 10) : null;
    const group = r._id.group ? String(r._id.group) : null;
    return {
      key: [r._id.source, date, r._id.ad, r._id.offer, group].join('|'),
      source: r._id.source,
      date,
      adName: r._id.ad,
      offer: r._id.offer,
      subIds: r.subIds.filter((s): s is string => typeof s === 'string' && s.trim() !== ''),
      group,
      ids: r.ids.map(String),
      rows: r.rows,
      spend: Math.round(r.spend * 100) / 100,
      revenue: Math.round(r.revenue * 100) / 100,
      events: Math.round(r.events),
      purchases: Math.round(r.purchases),
    };
  });
}

export interface RowGroupInput {
  source: RowSource;
  ids: string[];
  /** null clears the row's own group (it then follows ad_access by ad name again). */
  group: FacebookAccessGroup | null;
}

/** Sets (or clears) access_group on the given report / partner rows. Returns the rows changed. */
export async function saveRowGroups(items: RowGroupInput[]): Promise<number> {
  let changed = 0;
  for (const item of items) {
    if (item.ids.length === 0) continue;
    const model = (item.source === 'partner' ? FacebookConversion : FacebookAdReport) as unknown as typeof FacebookConversion;
    const update = item.group ? { $set: { access_group: item.group } } : { $unset: { access_group: 1 } };
    const res = await model.updateMany({ _id: { $in: item.ids } }, update);
    changed += res.modifiedCount;
  }
  return changed;
}
