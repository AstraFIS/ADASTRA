import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import type { DateRangeKey, MetricComparison } from '../types/facebook.js';
import { isoDay } from '../utils/dateRange.js';
import { compareMetric } from './facebook.service.js';
import { ACTIVE_WINDOW_DAYS } from './fbFunnel.service.js';
import { buildRecommendation, type AdRecommendation, type LatestSpendDay } from './fbRecommendation.service.js';
import {
  dateMatch,
  describeRange,
  FEE_USD,
  latestReportDate,
  num,
  reportBaseMatch,
  resolveReportBounds,
  textMatch,
  TOTAL_SPEND,
  type FbStatisticsQuery,
} from './fbStatistics.service.js';

export interface AdStatistics {
  amount_spent: number; // Σ total_spend_usd (incl. provider fees)
  link_clicks: number;
  ctr: number | null; // link_clicks ÷ impressions × 100
  cpc: number | null; // Σ spend_usd ÷ link_clicks (before fees)
  cac: number | null; // amount_spent ÷ conversions
  roas: number | null; // net_profit ÷ amount_spent × 100
  revenue: number; // Σ revenue_usd
  // supporting numbers
  spend_before_fees: number;
  provider_fees: number;
  net_profit: number;
  impressions: number;
  clicks_all: number;
  conversions: number;
  landing_page_views: number;
  // funnel stages (each an independent share of link clicks, not a chained funnel)
  first_page_views: number;
  questionnaire_starts: number;
  leads_partial: number;
  add_to_carts: number;
  purchase_events: number;
}

export interface FbAdStatisticsResult {
  ad: {
    ad_name: string;
    offers: string[];
    providers: string[];
    campaigns: string[];
    first_date: string | null; // within the range
    last_date: string | null;
    days: number; // distinct reporting days within the range
    active: boolean; // reported within ACTIVE_WINDOW_DAYS of the collection's latest day
  };
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  statistics: AdStatistics;
  /** Blended values over every ad in the same range. */
  account: { ctr: number | null; cpc: number | null; cac: number | null };
  comparisons: { ctr: MetricComparison | null; cpc: MetricComparison | null; cac: MetricComparison | null };
  recommendation: AdRecommendation;
  meta: { rows: number; account_rows: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (num: number, den: number, scale = 1): number | null => (den > 0 ? round2((num / den) * scale) : null);
const DAY_MS = 24 * 60 * 60 * 1000;

interface Totals {
  revenue_usd: number;
  spend_usd: number;
  provider_fee_usd: number;
  total_spend_usd: number;
  impressions: number;
  clicks_all: number;
  link_clicks: number;
  landing_page_views: number;
  conversions: number;
  first_page_views: number;
  questionnaire_starts: number;
  leads_partial: number;
  add_to_carts: number;
  purchase_events: number;
  rows: number;
  days: Date[];
  first_date: Date | null;
  last_date: Date | null;
  offers: string[];
  providers: (string | null)[];
  campaigns: string[];
}

async function totals(match: Record<string, unknown>): Promise<Totals | null> {
  const [t] = await FacebookAdReport.aggregate<Totals>([
    { $match: match },
    {
      $group: {
        _id: null,
        revenue_usd: { $sum: num('revenue_usd') },
        spend_usd: { $sum: num('spend_usd') },
        provider_fee_usd: { $sum: FEE_USD },
        total_spend_usd: { $sum: TOTAL_SPEND },
        impressions: { $sum: num('impressions') },
        clicks_all: { $sum: num('clicks_all') },
        link_clicks: { $sum: num('link_clicks') },
        landing_page_views: { $sum: num('landing_page_views') },
        conversions: { $sum: num('conversions') },
        first_page_views: { $sum: num('first_page_views') },
        questionnaire_starts: { $sum: num('questionnaire_starts') },
        leads_partial: { $sum: num('leads_partial') },
        add_to_carts: { $sum: num('add_to_carts') },
        purchase_events: { $sum: num('purchase_events') },
        rows: { $sum: 1 },
        days: { $addToSet: '$report_date' },
        first_date: { $min: '$report_date' },
        last_date: { $max: '$report_date' },
        offers: { $addToSet: { $toString: '$offer_name' } },
        providers: { $addToSet: { $toString: '$provider_name' } },
        campaigns: { $addToSet: { $toString: '$campaign_name' } },
      },
    },
  ]);
  return t ?? null;
}

const stats = (t: Totals | null): AdStatistics => {
  const revenue = round2(t?.revenue_usd ?? 0);
  const amount_spent = round2(t?.total_spend_usd ?? 0);
  const net_profit = round2(revenue - amount_spent);
  return {
    amount_spent,
    link_clicks: t?.link_clicks ?? 0,
    ctr: ratio(t?.link_clicks ?? 0, t?.impressions ?? 0, 100),
    cpc: ratio(t?.spend_usd ?? 0, t?.link_clicks ?? 0),
    cac: ratio(amount_spent, t?.conversions ?? 0),
    roas: ratio(net_profit, amount_spent, 100),
    revenue,
    spend_before_fees: round2(t?.spend_usd ?? 0),
    provider_fees: round2(t?.provider_fee_usd ?? 0),
    net_profit,
    impressions: t?.impressions ?? 0,
    clicks_all: t?.clicks_all ?? 0,
    conversions: t?.conversions ?? 0,
    landing_page_views: t?.landing_page_views ?? 0,
    first_page_views: t?.first_page_views ?? 0,
    questionnaire_starts: t?.questionnaire_starts ?? 0,
    leads_partial: t?.leads_partial ?? 0,
    add_to_carts: t?.add_to_carts ?? 0,
    purchase_events: t?.purchase_events ?? 0,
  };
};

const clean = (values: (string | null)[] | undefined) =>
  (values ?? []).filter((v): v is string => typeof v === 'string' && v !== '' && v !== 'null').sort();

/** The ad's most recent day with spend in the range, and its ROAS over the other days. */
async function latestSpendDay(match: Record<string, unknown>): Promise<LatestSpendDay | null> {
  const days = await FacebookAdReport.aggregate<{ _id: Date; spend: number; revenue: number; conversions: number }>([
    { $match: match },
    {
      $group: {
        _id: '$report_date',
        spend: { $sum: TOTAL_SPEND },
        revenue: { $sum: num('revenue_usd') },
        conversions: { $sum: num('conversions') },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const last = days.filter((d) => d.spend > 0).pop();
  if (!last) return null;
  const earlier = days.filter((d) => d !== last);
  const spendBefore = earlier.reduce((sum, d) => sum + d.spend, 0);
  const revenueBefore = earlier.reduce((sum, d) => sum + d.revenue, 0);
  return {
    date: isoDay(last._id),
    spend: round2(last.spend),
    conversions: last.conversions,
    roas_before: ratio(revenueBefore - spendBefore, spendBefore, 100),
  };
}

/** Returns null when the ad has never reported (→ 404). */
export async function getFbAdStatistics(adName: string, query: FbStatisticsQuery): Promise<FbAdStatisticsResult | null> {
  // an ad outside the caller's access is reported as unknown, the same as one that never ran
  if (query.allowedAds && !query.allowedAds.includes(adName)) return null;
  const adMatch = { ad_name: textMatch(adName) };
  const everReported = await latestReportDate(adMatch);
  if (!everReported) return null;

  // ranges are anchored on the whole collection's latest day, so "This Month" means the same thing on every page
  const bounds = await resolveReportBounds(query);
  const inRange = dateMatch(bounds);
  // the "account" benchmark only covers ads the caller can see
  const accountMatch = { ...reportBaseMatch({ allowedAds: query.allowedAds }), ...inRange };

  const [ad, account, latestOverall, latestDay] = await Promise.all([
    totals({ ...adMatch, ...inRange }),
    totals(accountMatch),
    latestReportDate({}),
    latestSpendDay({ ...adMatch, ...inRange }),
  ]);

  const adStats = stats(ad);
  const accountStats = stats(account);
  const activeSince = (latestOverall?.getTime() ?? 0) - ACTIVE_WINDOW_DAYS * DAY_MS;

  return {
    ad: {
      ad_name: adName,
      offers: clean(ad?.offers),
      providers: clean(ad?.providers),
      campaigns: clean(ad?.campaigns),
      first_date: ad?.first_date ? isoDay(ad.first_date) : null,
      last_date: ad?.last_date ? isoDay(ad.last_date) : null,
      days: ad?.days.filter((d) => d instanceof Date).length ?? 0,
      active: everReported.getTime() >= activeSince,
    },
    range: describeRange(query, bounds),
    statistics: adStats,
    account: { ctr: accountStats.ctr, cpc: accountStats.cpc, cac: accountStats.cac },
    comparisons: {
      ctr: compareMetric(adStats.ctr, accountStats.ctr, true),
      cpc: compareMetric(adStats.cpc, accountStats.cpc, false),
      cac: compareMetric(adStats.cac, accountStats.cac, false),
    },
    recommendation: buildRecommendation(adStats, latestDay),
    meta: { rows: ad?.rows ?? 0, account_rows: account?.rows ?? 0 },
  };
}
