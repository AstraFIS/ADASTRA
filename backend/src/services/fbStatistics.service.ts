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

export interface FbStatisticsResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  statistics: FbStatistics;
  meta: { rows: number; ads: number; impressions: number; spend_before_fees: number; provider_fees: number };
}

/** Loose match object: filters may hold `$in` with mixed string/number values (see textMatch). */
export type ReportFilter = Record<string, unknown>;

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
        total_revenue: { $sum: '$revenue_usd' },
        total_amount_spend: { $sum: '$total_spend_usd' },
        spend_before_fees: { $sum: '$spend_usd' },
        provider_fees: { $sum: '$provider_fee_usd' },
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

  if (!agg) {
    return {
      range,
      filters,
      statistics: EMPTY,
      meta: { rows: 0, ads: 0, impressions: 0, spend_before_fees: 0, provider_fees: 0 },
    };
  }

  const total_revenue = round2(agg.total_revenue);
  const total_amount_spend = round2(agg.total_amount_spend);

  return {
    range,
    filters,
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
