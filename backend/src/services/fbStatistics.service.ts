import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import type { DateRangeKey } from '../types/facebook.js';
import { DATE_RANGE_OPTIONS, isoDay, resolveRange } from '../utils/dateRange.js';

export interface FbStatisticsQuery {
  range: DateRangeKey;
  /** Explicit bounds (YYYY-MM-DD) take precedence over `range`. */
  from?: string | undefined;
  to?: string | undefined;
  ad?: string | undefined;
  offer?: string | undefined;
}

export interface FbStatistics {
  total_revenue: number; // Σ revenue_usd
  total_amount_spend: number; // Σ total_spend_usd (spend grossed up by provider fees)
  net_profit: number; // total_revenue − total_amount_spend
  landing_page_views: number; // Σ landing_page_views
  link_clicks: number; // Σ link_clicks
  cpc: number | null; // Σ spend_usd ÷ Σ link_clicks (before fees), null without clicks
  ctr: number | null; // Σ link_clicks ÷ Σ impressions × 100, null without impressions
}

/** "Ad platform provider fees" card: one provider's spend and fee over the selection. */
export interface ProviderFeeStat {
  provider_name: string;
  fee_pct: number | null; // provider_fee_usd ÷ spend_usd × 100 (the rate actually applied), null without spend
  amount_spent: number; // Σ spend_usd (before fee)
  provider_fee: number; // Σ provider_fee_usd
  total_with_fee: number; // Σ total_spend_usd
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
 * Newest report_date matching a filter. Uses the aggregation pipeline rather
 * than findOne because Mongoose casts query values to the schema type, which
 * would turn `{ $in: ['3.1', 3.1] }` into two strings and miss rows imported
 * with a numeric ad_name. Pipelines are not cast.
 */
export async function latestReportDate(match: ReportFilter): Promise<Date | null> {
  const [row] = await FacebookAdReport.aggregate<{ report_date: Date }>([
    { $match: match },
    { $sort: { report_date: -1 } },
    { $limit: 1 },
    { $project: { _id: 0, report_date: 1 } },
  ]);
  return row?.report_date ?? null;
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
};

export type ReportBounds = { from: string; to: string } | null;

/**
 * Match a text field against a query value. Rows imported outside Mongoose may
 * hold a number where we expect text (an ad literally named 3.1), so a numeric-
 * looking value matches both representations.
 */
export function textMatch(value: string): unknown {
  const asNumber = Number(value);
  return value.trim() !== '' && Number.isFinite(asNumber) ? { $in: [value, asNumber] } : value;
}

/** Mongo match for the ad / offer part of a query. */
export function reportBaseMatch(query: Pick<FbStatisticsQuery, 'ad' | 'offer'>): ReportFilter {
  const baseMatch: ReportFilter = {};
  if (query.ad) baseMatch.ad_name = textMatch(query.ad);
  if (query.offer) baseMatch.offer_name = textMatch(query.offer);
  return baseMatch;
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

/** `report_date` condition for the bounds, or nothing for all time. */
export function dateMatch(bounds: ReportBounds): Record<string, unknown> {
  return bounds ? { report_date: { $gte: toDate(bounds.from), $lte: toDate(bounds.to, true) } } : {};
}

export function describeRange(query: FbStatisticsQuery, bounds: ReportBounds) {
  const label = DATE_RANGE_OPTIONS.find((o) => o.key === query.range)?.label ?? query.range;
  return { key: query.range, label, from: bounds?.from ?? null, to: bounds?.to ?? null };
}

export async function getFbStatistics(query: FbStatisticsQuery): Promise<FbStatisticsResult> {
  const baseMatch = reportBaseMatch(query);
  const bounds = await resolveReportBounds(query);
  const match: ReportFilter = { ...baseMatch, ...dateMatch(bounds) };

  const [agg] = await FacebookAdReport.aggregate<{
    total_revenue: number;
    total_amount_spend: number;
    spend_before_fees: number;
    provider_fees: number;
    landing_page_views: number;
    link_clicks: number;
    impressions: number;
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
        rows: { $sum: 1 },
        ads: { $addToSet: '$ad_name' },
      },
    },
  ]);

  const range = describeRange(query, bounds);
  const filters = { ad: query.ad ?? null, offer: query.offer ?? null };
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
      cpc: agg.link_clicks > 0 ? round2(agg.spend_before_fees / agg.link_clicks) : null,
      ctr: agg.impressions > 0 ? round2((agg.link_clicks / agg.impressions) * 100) : null,
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
 * Per-provider spend / fee totals for a selection. Providers are listed from
 * the whole collection so a card still appears (with zeros) when a provider
 * had no spend in the selected period.
 */
async function providerFees(match: ReportFilter): Promise<ProviderFeeStat[]> {
  const [known, inRange] = await Promise.all([
    FacebookAdReport.aggregate<{ _id: string | null }>([
      { $group: { _id: { $toString: '$provider_name' } } },
    ]),
    FacebookAdReport.aggregate<{
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
  const isProvider = (v: string | null): v is string => typeof v === 'string' && v !== '' && v !== 'null';
  const byName = new Map(inRange.filter((p) => isProvider(p._id)).map((p) => [p._id as string, p]));
  return known
    .map((p) => p._id)
    .filter(isProvider)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const p = byName.get(name);
      const amount_spent = round2(p?.spend_usd ?? 0);
      const provider_fee = round2(p?.provider_fee_usd ?? 0);
      return {
        provider_name: name,
        fee_pct: amount_spent > 0 ? round2((provider_fee / amount_spent) * 100) : null,
        amount_spent,
        provider_fee,
        total_with_fee: round2(p?.total_spend_usd ?? 0),
        rows: p?.rows ?? 0,
      };
    });
}
