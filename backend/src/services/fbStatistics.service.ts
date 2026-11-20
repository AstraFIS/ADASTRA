import type { PipelineStage } from 'mongoose';
import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import { FacebookConversion } from '../models/facebookConversion.model.js';
import { FacebookProvider } from '../models/facebookProvider.model.js';
import type { DateRangeKey } from '../types/facebook.js';
import { dayExpr } from '../utils/bingDate.js';
import { DATE_RANGE_OPTIONS, isoDay, resolveRange } from '../utils/dateRange.js';

export interface FbStatisticsQuery {
  range: DateRangeKey;
  /** Explicit bounds (YYYY-MM-DD) take precedence over `range`. */
  from?: string | undefined;
  to?: string | undefined;
  /** One ad name, or several (any of them). */
  ad?: string | string[] | undefined;
  /** One offer, or several (any of them). */
  offer?: string | string[] | undefined;
  /** "ED" / "GLP" / "Other" — one or several (see CATEGORY). */
  category?: string | string[] | undefined;
  /** Ad platform provider(s) (see reportBaseMatch / providerScope). */
  provider?: string | string[] | undefined;
  /**
   * Single ad accounts within a provider, as "Provider||Account" (see ACCOUNT_SEP); the account
   * part is NO_ACCOUNT for that provider's rows without an account_name. Combined with `provider`
   * as "any of": a whole provider, or just some of its accounts.
   */
  account?: string | string[] | undefined;
  /** Ad names that ever spent under `provider` / `account` (set by providerScope); their partner events count for it. */
  providerAds?: string[] | undefined;
  /** Ad names the caller may see (from facebookScope); null / undefined means every ad. */
  allowedAds?: string[] | null | undefined;
  /**
   * Groups the caller may see (from facebookScope). Rows with their own `access_group`
   * are matched by it; rows without one by `allowedAds`. Only used when allowedAds is set.
   */
  allowedGroups?: string[] | null | undefined;
}

export interface FbStatistics {
  total_revenue: number; // Σ revenue_usd
  total_amount_spend: number; // Σ total_spend_usd (spend grossed up by provider fees)
  net_profit: number; // total_revenue − total_amount_spend
  landing_page_views: number; // Σ landing_page_views
  link_clicks: number; // Σ link_clicks
  cpc: number | null; // total_amount_spend ÷ Σ link_clicks (incl. provider fees), null without clicks
  ctr: number | null; // Σ link_clicks ÷ Σ impressions × 100, null without impressions
  leads: number; // Σ add_to_carts (partner "Add to Cart" events)
  cpl: number | null; // total_amount_spend ÷ leads (cost per lead, incl. provider fees)
  cpm: number | null; // total_amount_spend ÷ Σ impressions × 1000 (incl. provider fees)
  purchases: number; // Σ purchase_events
  cr: number | null; // purchases ÷ link_clicks × 100 (click → purchase conversion rate)
  cac: number | null; // total_amount_spend ÷ purchases (incl. provider fees)
}

/** "Ad platform provider fees" card: one provider's spend and fee over the selection. */
export interface ProviderFeeStat {
  provider_name: string;
  fee_pct: number | null; // the provider table's fee %, else the rate actually applied; null without either
  amount_spent: number; // Σ spend_usd (before fee)
  provider_fee: number; // Σ provider_fee_usd
  total_with_fee: number; // Σ total_spend_usd
  share_pct: number; // amount_spent ÷ all providers' amount_spent × 100
  is_default: boolean; // marked default in the provider table (informational)
  no_provider?: boolean; // the line for spend that has no provider (no fee)
  rows: number;
}

export interface FbStatisticsResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  statistics: FbStatistics;
  /** Every provider seen in the whole collection, with its totals for this selection (zeros if none). */
  providers: ProviderFeeStat[];
  meta: { rows: number; ads: number; impressions: number; spend_before_fees: number; provider_fees: number };
}

/** Loose match object: filters may hold `$in` with mixed string/number values (see textMatch). */
export type ReportFilter = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Money expressions. Fees and totals are computed from the base numbers inside
// the pipeline rather than summed from the stored derived columns, so results
// are right even for rows imported with a ×100 fee percentage (753 = 7.53 %)
// or with derived columns stored as text. Mirrors deriveFields() in the model.
// ---------------------------------------------------------------------------

/** A numeric field read defensively: text / missing / null → 0. */
export const num = (field: string) => ({ $convert: { input: `$${field}`, to: 'double', onError: 0, onNull: 0 } });

/** provider_fee_pct as a real percentage: 7.53 stays 7.53, 753 becomes 7.53. */
export const FEE_PCT = {
  $let: {
    vars: { p: num('provider_fee_pct') },
    in: { $cond: [{ $gt: ['$$p', 100] }, { $divide: [{ $round: ['$$p', 0] }, 100] }, { $max: ['$$p', 0] }] },
  },
};
/** Fee in USD for the row, rounded to cents like the model does. */
export const FEE_USD = { $round: [{ $divide: [{ $multiply: [num('spend_usd'), FEE_PCT] }, 100] }, 2] };
/** Spend grossed up by the provider fee. */
export const TOTAL_SPEND = { $add: [num('spend_usd'), FEE_USD] };

/**
 * report_date as a real Date. Imports store it either as a Date or as sheet
 * text "DD/MM/YYYY" ("05/08/2026" = 5 Aug 2026); ISO text ("2026-08-05") is
 * accepted too. Anything unreadable becomes null and is excluded by dateMatch.
 */
export const REPORT_DATE = {
  $switch: {
    branches: [
      { case: { $eq: [{ $type: '$report_date' }, 'date'] }, then: '$report_date' },
      {
        case: { $eq: [{ $type: '$report_date' }, 'string'] },
        then: {
          $dateFromString: {
            dateString: { $trim: { input: '$report_date' } },
            format: '%d/%m/%Y',
            timezone: 'UTC',
            onError: {
              $dateFromString: { dateString: { $trim: { input: '$report_date' } }, timezone: 'UTC', onError: null },
            },
          },
        },
      },
    ],
    default: null,
  },
};

/** The row's provider: `provider_name`, or the sheet's `Provider` column when imported as-is. */
export const PROVIDER_NAME = { $ifNull: ['$provider_name', '$Provider', null] };

/**
 * facebook_ad_reports funnel column → the partner event stages that count toward it.
 * Besides the standard stage names, the spellings some imports stored are accepted
 * ("base", "start_quiz", "lead", …), so such rows are never silently left out.
 */
const STAGE_COLUMN: Record<string, string[]> = {
  presell_visits: ['presell_visit'],
  first_page_views: ['first_page_view', 'base'],
  questionnaire_starts: ['questionnaire_start', 'start_quiz'],
  questionnaire_completed: ['questionnaire_completed', 'lead', 'quiz_completion', 'quiz_completed'],
  add_to_carts: ['add_to_cart'],
};
const PURCHASE_STAGES = ['purchase'];
const countIf = (stages: string[]) => ({
  $cond: [{ $in: [{ $toLower: { $ifNull: ['$event_stage', ''] } }, stages] }, num('event_count'), 0],
});

/**
 * facebook_conversions (partner events) reshaped as report rows: no spend or delivery,
 * just the funnel counts and revenue on that day and ad. Unioned into every report
 * aggregation, so totals, charts and tables add Facebook spend and partner results
 * together — the live blend, joined on day + ad name.
 */
const PARTNER_ROWS: PipelineStage[] = [
  {
    $project: {
      _source: { $literal: 'partner' },
      report_date: dayExpr('event_date'),
      ad_name: 1,
      offer_name: 1,
      sub_id: 1,
      access_group: 1,
      age: { $literal: 'unknown' },
      gender: { $literal: 'unknown' },
      region: 1,
      device: 1,
      provider_fee_pct: { $literal: 0 },
      spend_usd: { $literal: 0 },
      impressions: { $literal: 0 },
      clicks_all: { $literal: 0 },
      link_clicks: { $literal: 0 },
      landing_page_views: { $literal: 0 },
      ...Object.fromEntries(Object.entries(STAGE_COLUMN).map(([column, stages]) => [column, countIf(stages)])),
      purchase_events: countIf(PURCHASE_STAGES),
      conversions: countIf(PURCHASE_STAGES), // verified purchases drive CAC
      revenue_usd: { $ifNull: ['$revenue_usd', 0] },
    },
  },
];

/** How rows without an ad name are shown and filtered. */
export const NO_AD_NAME = '(no ad name)';
const MISSING_AD_NAMES = ['', '<NA>', 'nan', 'NaN', 'None', 'null', 'undefined'];

/**
 * Product category of a row, from its names: the offer name decides first ("GLP" in any
 * case → GLP, else "ED" in capitals → ED — capitals only, so "Meds" is not ED), then the
 * ad name by the same rule; anything else is "Other".
 */
const nameText = (field: string) => ({ $toString: { $ifNull: [field, ''] } });
const has = (field: string, regex: string, options = '') => ({ $regexMatch: { input: nameText(field), regex, options } });
export const CATEGORY = {
  $switch: {
    branches: [
      { case: has('$offer_name', 'glp', 'i'), then: 'GLP' },
      { case: has('$offer_name', 'ED'), then: 'ED' },
      { case: has('$ad_name', 'glp', 'i'), then: 'GLP' },
      { case: has('$ad_name', 'ED'), then: 'ED' },
    ],
    default: 'Other',
  },
};
export const CATEGORIES = ['ED', 'GLP', 'Other'] as const;

/** First element of an array field, or null. */
const first = (field: string) => ({ $arrayElemAt: [field, 0] });

/** Provider fee % from facebook_providers; rows without a provider keep their spend with no fee. */
const PROVIDER_FEE_STAGES: PipelineStage[] = [
  { $lookup: { from: 'facebook_providers', localField: 'provider_name', foreignField: 'provider_name', as: '_provider' } },
  { $addFields: { _hasProvider: { $gt: [{ $strLenCP: { $ifNull: [{ $toString: '$provider_name' }, ''] } }, 0] } } },
  {
    $addFields: {
      // rows without a provider still count as spend, with no provider fee
      provider_name: { $cond: ['$_hasProvider', '$provider_name', null] },
      provider_fee_pct: { $cond: ['$_hasProvider', { $ifNull: [first('$_provider.fee_pct'), '$provider_fee_pct'] }, 0] },
    },
  },
  { $project: { _provider: 0, _hasProvider: 0 } },
];

/**
 * Report rows as every endpoint sees them:
 *  1. facebook_ad_reports (the Facebook Ads export) with report_date normalised to a Date
 *     (stored as a Date or as "DD/MM/YYYY" text) and the provider fee % taken from
 *     facebook_providers — rows without a provider count as spend with no fee;
 *  2. plus facebook_conversions (partner events: funnel + revenue, see PARTNER_ROWS),
 *     joined to the Facebook rows on day + ad name by the grouping of each endpoint.
 */
export const BLENDED_REPORT_ROWS: PipelineStage[] = blendStages();

/** The blend, optionally reading only some days of each collection (see datePrefilter). */
function blendStages(pre?: { reports: PipelineStage.Match; conversions: PipelineStage.Match }): PipelineStage[] {
  return [
    ...(pre ? [pre.reports] : []),
    { $addFields: { report_date: REPORT_DATE, provider_name: PROVIDER_NAME } },
    ...PROVIDER_FEE_STAGES,
    { $unionWith: { coll: 'facebook_conversions', pipeline: [...(pre ? [pre.conversions] : []), ...PARTNER_ROWS] as never } },
    // one spelling for "no ad name" (empty, missing, or "<NA>" / "nan" left by a spreadsheet)
    { $addFields: { ad_name: { $cond: [{ $in: [{ $ifNull: ['$ad_name', ''] }, MISSING_AD_NAMES] }, NO_AD_NAME, '$ad_name'] } } },
    { $addFields: { category: CATEGORY } },
  ];
}

/**
 * Aggregate over the blended report rows (facebook_ad_reports + partner events, provider
 * fees from the provider table). Use this instead of a model's own aggregate().
 * A leading date-range $match is also applied to each collection before the blend.
 */
export function reportAggregate<T>(pipeline: PipelineStage[]) {
  const pre = datePrefilter(pipeline);
  return FacebookAdReport.aggregate<T>([...(pre ? blendStages(pre) : BLENDED_REPORT_ROWS), ...pipeline]);
}

/**
 * When a pipeline starts with a date-range $match (dateMatch), filter each collection by
 * that range before the blend, so MongoDB reads only those days through the date index.
 * Rows whose day is still stored as text pass through and are filtered after the blend as
 * before, so the result is always the same; see ensureDatesNormalized in reportCache.service.
 */
function datePrefilter(pipeline: PipelineStage[]): { reports: PipelineStage.Match; conversions: PipelineStage.Match } | null {
  const first = pipeline[0] as { $match?: Record<string, unknown> } | undefined;
  const rd = first?.$match?.report_date as { $gte?: unknown; $lte?: unknown } | undefined;
  if (!rd || typeof rd !== 'object') return null;
  const range: Record<string, Date> = {};
  if (rd.$gte instanceof Date) range.$gte = rd.$gte;
  if (rd.$lte instanceof Date) range.$lte = rd.$lte;
  if (!range.$gte && !range.$lte) return null;
  const on = (field: string): PipelineStage.Match => ({
    $match: { $or: [{ [field]: range }, { [field]: { $type: 'string' } }] },
  });
  return { reports: on('report_date'), conversions: on('event_date') };
}

/**
 * Newest report_date matching a filter. Uses the aggregation pipeline rather
 * than findOne because Mongoose casts query values to the schema type, which
 * would turn `{ $in: ['3.1', 3.1] }` into two strings and miss rows imported
 * with a numeric ad_name. Pipelines are not cast.
 */
export async function latestReportDate(match: ReportFilter): Promise<Date | null> {
  if (Object.keys(match).length === 0) return latestOverall();
  const [row] = await reportAggregate<{ report_date: Date }>([
    { $match: { ...match, report_date: { $type: 'date' } } },
    { $sort: { report_date: -1 } },
    { $limit: 1 },
    { $project: { _id: 0, report_date: 1 } },
  ]);
  return row?.report_date ?? null;
}

let latestMemo: { at: number; value: Date | null } | null = null;

/**
 * Newest day in either collection. With every day stored as a Date this is two indexed
 * look-ups instead of a pass over all rows; if any day is still text it falls back to that pass.
 */
async function latestOverall(): Promise<Date | null> {
  if (latestMemo && Date.now() - latestMemo.at < 30_000) return latestMemo.value;
  const reports = FacebookAdReport.collection;
  const conversions = FacebookConversion.collection;
  const [textReport, textConversion] = await Promise.all([
    reports.findOne({ report_date: { $type: 'string' } }, { projection: { _id: 1 } }),
    conversions.findOne({ event_date: { $type: 'string' } }, { projection: { _id: 1 } }),
  ]);
  let value: Date | null;
  if (textReport || textConversion) {
    const [row] = await reportAggregate<{ report_date: Date }>([
      { $match: { report_date: { $type: 'date' } } },
      { $sort: { report_date: -1 } },
      { $limit: 1 },
      { $project: { _id: 0, report_date: 1 } },
    ]);
    value = row?.report_date ?? null;
  } else {
    const [a, b] = await Promise.all([
      reports.find({ report_date: { $type: 'date' } }, { projection: { report_date: 1 } }).sort({ report_date: -1 }).limit(1).next(),
      conversions.find({ event_date: { $type: 'date' } }, { projection: { event_date: 1 } }).sort({ event_date: -1 }).limit(1).next(),
    ]);
    const days = [a?.report_date, b?.event_date].filter((d): d is Date => d instanceof Date);
    value = days.length ? new Date(Math.max(...days.map((d) => d.getTime()))) : null;
  }
  latestMemo = { at: Date.now(), value };
  return value;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const toDate = (iso: string, endOfDay = false) => new Date(`${iso}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);

const EMPTY: FbStatistics = {
  total_revenue: 0,
  total_amount_spend: 0,
  net_profit: 0,
  landing_page_views: 0,
  link_clicks: 0,
  cpc: null,
  ctr: null,
  leads: 0,
  cpl: null,
  cpm: null,
  purchases: 0,
  cr: null,
  cac: null,
};

export type ReportBounds = { from: string; to: string } | null;

/**
 * Match a text field against a query value. Rows imported outside Mongoose may
 * hold a number where we expect text (an ad literally named 3.1), so a numeric-
 * looking value matches both representations.
 */
export function textMatch(value: string): unknown {
  const values = textValues(value);
  return values.length > 1 ? { $in: values } : value;
}

/** The stored representations a text value may have: itself, plus the number when it looks like one. */
export function textValues(value: string): (string | number)[] {
  const asNumber = Number(value);
  return value.trim() !== '' && Number.isFinite(asNumber) ? [value, asNumber] : [value];
}

const asList = (value: string | string[]) => (Array.isArray(value) ? value : [value]);

/** Match one value or any of several (each also as a number when it looks like one). */
function anyOf(value: string | string[]): unknown {
  const list = asList(value);
  return list.length === 1 ? textMatch(list[0]!) : { $in: list.flatMap(textValues) };
}

/** How a single / multiple filter is echoed back in `filters` (display text, null = all). */
export function filterLabel(value: string | string[] | undefined): string | null {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return Array.isArray(value) ? value.join(', ') : value;
}

/** Mongo match for the ad / offer / access part of a query. */
export function reportBaseMatch(
  query: Pick<FbStatisticsQuery, 'ad' | 'offer' | 'category' | 'provider' | 'account' | 'providerAds' | 'allowedAds' | 'allowedGroups'>,
): ReportFilter {
  const baseMatch: ReportFilter = {};
  if (query.ad) baseMatch.ad_name = anyOf(query.ad);
  if (query.allowedAds) {
    // a row's own access_group (set by hand) wins; otherwise its ad name must be in the caller's groups
    baseMatch.$or = [
      { access_group: { $in: query.allowedGroups ?? [] } },
      { access_group: { $in: [null, ''] }, ad_name: { $in: query.allowedAds.flatMap(textValues) } },
    ];
  }
  if (query.offer) baseMatch.offer_name = anyOf(query.offer);
  if (query.category) baseMatch.category = { $in: asList(query.category) };
  const rowsOf = providerRows(query.provider, query.account);
  if (rowsOf) {
    // Facebook rows carry their provider (and account); partner events don't, so they count for a
    // provider / account through their ad name (the ads that spent under it)
    baseMatch.$and = [
      {
        $or: [...rowsOf, { provider_name: null, ad_name: { $in: (query.providerAds ?? []).flatMap(textValues) } }],
      },
    ];
  }
  return baseMatch;
}

/** "Provider||Account" in the `account` filter; NO_ACCOUNT stands for a provider's rows without an account. */
export const ACCOUNT_SEP = '||';
export const NO_ACCOUNT = '(no account)';

/** Facebook-row conditions for the provider / account filter (null = no such filter). */
function providerRows(provider: string | string[] | undefined, account: string | string[] | undefined) {
  const whole = provider ? asList(provider) : [];
  const parts = (account ? asList(account) : [])
    .map((a) => {
      const at = a.indexOf(ACCOUNT_SEP);
      return at > 0 ? { p: a.slice(0, at), a: a.slice(at + ACCOUNT_SEP.length) } : null;
    })
    .filter((x): x is { p: string; a: string } => x !== null && !whole.includes(x.p));
  if (whole.length === 0 && parts.length === 0) return null;
  const rows: Record<string, unknown>[] = [];
  if (whole.length) rows.push({ provider_name: { $in: whole } });
  for (const { p, a } of parts) {
    rows.push({ provider_name: p, account_name: a === NO_ACCOUNT ? { $in: [null, ''] } : a });
  }
  return rows;
}

/** Provider / account filter → the ad names that ever spent under them (any date). */
export async function providerScope(
  provider: string | string[] | undefined,
  account?: string | string[] | undefined,
): Promise<Pick<FbStatisticsQuery, 'provider' | 'account' | 'providerAds'>> {
  const rowsOf = providerRows(provider, account);
  if (!rowsOf) return {};
  const rows = await reportAggregate<{ _id: unknown }>([
    { $match: { $or: rowsOf } },
    { $group: { _id: '$ad_name' } },
  ]);
  const providerAds = [...new Set(rows.map((r) => String(r._id ?? '').trim()).filter(Boolean))];
  return { provider, account, providerAds };
}

/**
 * Inclusive day bounds for a query. Named ranges are anchored on the latest
 * day in the whole collection, so "This Month" is the same window on every
 * page and for every ad / offer filter (not the server clock, and not the
 * filtered ad's own last day).
 */
export async function resolveReportBounds(query: FbStatisticsQuery): Promise<ReportBounds> {
  const latest = await latestReportDate({});
  if (query.from || query.to) {
    return {
      from: query.from ?? '0001-01-01',
      to: query.to ?? (latest ? isoDay(latest) : '9999-12-31'),
    };
  }
  return latest ? resolveRange(query.range, isoDay(latest)) : null;
}

/**
 * `report_date` condition for the bounds. Always requires a real Date, so an
 * empty / malformed imported row (no date) can never reach an aggregation —
 * "all time" therefore means "every row that has a date", not "every row".
 */
export function dateMatch(bounds: ReportBounds): Record<string, unknown> {
  return bounds
    ? { report_date: { $type: 'date', $gte: toDate(bounds.from), $lte: toDate(bounds.to, true) } }
    : { report_date: { $type: 'date' } };
}

export function describeRange(query: FbStatisticsQuery, bounds: ReportBounds) {
  const label = DATE_RANGE_OPTIONS.find((o) => o.key === query.range)?.label ?? query.range;
  return { key: query.range, label, from: bounds?.from ?? null, to: bounds?.to ?? null };
}

export async function getFbStatistics(query: FbStatisticsQuery): Promise<FbStatisticsResult> {
  const baseMatch = reportBaseMatch(query);
  const bounds = await resolveReportBounds(query);
  const match: ReportFilter = { ...baseMatch, ...dateMatch(bounds) }; // dateMatch always excludes rows without a date

  const [agg] = await reportAggregate<{
    total_revenue: number;
    total_amount_spend: number;
    spend_before_fees: number;
    provider_fees: number;
    landing_page_views: number;
    link_clicks: number;
    impressions: number;
    leads: number;
    purchases: number;
    rows: number;
    ads: string[];
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        total_revenue: { $sum: num('revenue_usd') },
        total_amount_spend: { $sum: TOTAL_SPEND },
        spend_before_fees: { $sum: num('spend_usd') },
        provider_fees: { $sum: FEE_USD },
        landing_page_views: { $sum: '$landing_page_views' },
        link_clicks: { $sum: '$link_clicks' },
        impressions: { $sum: '$impressions' },
        leads: { $sum: num('add_to_carts') },
        purchases: { $sum: num('purchase_events') },
        rows: { $sum: 1 },
        ads: { $addToSet: '$ad_name' },
      },
    },
  ]);

  const range = describeRange(query, bounds);
  const filters = { ad: filterLabel(query.ad), offer: filterLabel(query.offer) };
  const providers = await providerFees(match);

  if (!agg) {
    return {
      range,
      filters,
      statistics: EMPTY,
      providers,
      meta: { rows: 0, ads: 0, impressions: 0, spend_before_fees: 0, provider_fees: 0 },
    };
  }

  const total_revenue = round2(agg.total_revenue);
  const total_amount_spend = round2(agg.total_amount_spend);

  return {
    range,
    filters,
    providers,
    statistics: {
      total_revenue,
      total_amount_spend,
      net_profit: round2(total_revenue - total_amount_spend),
      landing_page_views: agg.landing_page_views,
      link_clicks: agg.link_clicks,
      cpc: agg.link_clicks > 0 ? round2(total_amount_spend / agg.link_clicks) : null,
      ctr: agg.impressions > 0 ? round2((agg.link_clicks / agg.impressions) * 100) : null,
      leads: Math.round(agg.leads),
      cpl: agg.leads > 0 ? round2(total_amount_spend / agg.leads) : null,
      cpm: agg.impressions > 0 ? round2((total_amount_spend / agg.impressions) * 1000) : null,
      purchases: Math.round(agg.purchases),
      cr: agg.link_clicks > 0 ? round2((agg.purchases / agg.link_clicks) * 100) : null,
      cac: agg.purchases > 0 ? round2(total_amount_spend / agg.purchases) : null,
    },
    meta: {
      rows: agg.rows,
      ads: agg.ads.length,
      impressions: agg.impressions,
      spend_before_fees: round2(agg.spend_before_fees),
      provider_fees: round2(agg.provider_fees),
    },
  };
}

/**
 * Per-provider spend / fee totals for a selection, with each provider's share of spend.
 * Every provider in the provider table (and any other provider seen in the rows) is
 * listed, with zeros when it had no spend in the selected period.
 */
const NO_PROVIDER = 'No provider';

async function providerFees(match: ReportFilter): Promise<ProviderFeeStat[]> {
  const [table, known, inRange] = await Promise.all([
    FacebookProvider.find({}, { provider_name: 1, fee_pct: 1, is_default: 1, _id: 0 }).lean(),
    reportAggregate<{ _id: string | null }>([{ $group: { _id: { $toString: '$provider_name' } } }]),
    reportAggregate<{
      _id: string | null;
      spend_usd: number;
      provider_fee_usd: number;
      total_spend_usd: number;
      rows: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: { $toString: '$provider_name' },
          spend_usd: { $sum: num('spend_usd') },
          provider_fee_usd: { $sum: FEE_USD },
          total_spend_usd: { $sum: TOTAL_SPEND },
          rows: { $sum: 1 },
        },
      },
    ]),
  ]);
  const isProvider = (v: string | null | undefined): v is string => typeof v === 'string' && v !== '' && v !== 'null';
  const byName = new Map(inRange.filter((p) => isProvider(p._id)).map((p) => [p._id as string, p]));
  const tableByName = new Map(table.map((t) => [t.provider_name, t]));
  const names = [...new Set([...table.map((t) => t.provider_name), ...known.map((p) => p._id).filter(isProvider)])];
  // share of ALL spend in the selection, including spend that has no provider
  const totalSpend = inRange.reduce((sum, p) => sum + p.spend_usd, 0);

  const unassigned = inRange.find((p) => !isProvider(p._id));
  const noProvider: ProviderFeeStat[] =
    unassigned && unassigned.spend_usd > 0
      ? [
          {
            provider_name: NO_PROVIDER,
            fee_pct: 0,
            amount_spent: round2(unassigned.spend_usd),
            provider_fee: 0,
            total_with_fee: round2(unassigned.spend_usd),
            share_pct: totalSpend > 0 ? round2((unassigned.spend_usd / totalSpend) * 100) : 0,
            is_default: false,
            no_provider: true,
            rows: unassigned.rows,
          },
        ]
      : [];

  return names
    .map((name) => {
      const p = byName.get(name);
      const t = tableByName.get(name);
      const amount_spent = round2(p?.spend_usd ?? 0);
      const provider_fee = round2(p?.provider_fee_usd ?? 0);
      return {
        provider_name: name,
        fee_pct: t ? round2(t.fee_pct) : amount_spent > 0 ? round2((provider_fee / amount_spent) * 100) : null,
        amount_spent,
        provider_fee,
        total_with_fee: round2(p?.total_spend_usd ?? 0),
        share_pct: totalSpend > 0 ? round2(((p?.spend_usd ?? 0) / totalSpend) * 100) : 0,
        is_default: t?.is_default === true,
        rows: p?.rows ?? 0,
      };
    })
    .sort((a, b) => b.amount_spent - a.amount_spent || a.provider_name.localeCompare(b.provider_name))
    .concat(noProvider);
}
