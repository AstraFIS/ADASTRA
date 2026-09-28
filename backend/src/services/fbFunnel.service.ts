import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import type { DateRangeKey } from '../types/facebook.js';
import { isoDay } from '../utils/dateRange.js';
import {
  dateMatch,
  describeRange,
  reportBaseMatch,
  resolveReportBounds,
  type FbStatisticsQuery,
} from './fbStatistics.service.js';

/** An ad is "active" if it reported within this many days of the latest day in the result. */
export const ACTIVE_WINDOW_DAYS = 7;

/** One table row: an ad within one offer, summed over the selected period. */
export interface FunnelRow {
  ad_name: string;
  offer_name: string;
  providers: string[];
  first_date: string; // YYYY-MM-DD
  last_date: string;
  days: number; // reporting days with rows
  active: boolean;

  spend_usd: number; // before provider fees
  provider_fee_usd: number;
  total_spend_usd: number; // "Amount Spent"
  impressions: number;
  clicks_all: number;
  link_clicks: number;
  ctr_all: number | null; // clicks_all ÷ impressions × 100
  cpc_usd: number | null; // spend_usd ÷ clicks_all

  // funnel stages (step-over-step % is computed by the client)
  first_page_views: number;
  questionnaire_starts: number;
  leads_partial: number;
  add_to_carts: number;
  purchase_events: number;
  conversions: number; // verified conversions (CV) used for CAC / ROAS

  revenue_usd: number;
  net_profit_usd: number; // revenue_usd − total_spend_usd
  cac_usd: number | null; // total_spend_usd ÷ conversions
  roas_pct: number | null; // net_profit_usd ÷ total_spend_usd × 100
}

export interface FbFunnelResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  rows: FunnelRow[]; // sorted by total spend, descending
  meta: { rows: number; ads: number; inactive: number; active_window_days: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (num: number, den: number, scale = 1): number | null => (den > 0 ? round2((num / den) * scale) : null);
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getFbFunnel(query: FbStatisticsQuery): Promise<FbFunnelResult> {
  const baseMatch = reportBaseMatch(query);
  const bounds = await resolveReportBounds(query, baseMatch);
  const match = { ...baseMatch, ...dateMatch(bounds) };

  const groups = await FacebookAdReport.aggregate<{
    _id: { ad_name: string; offer_name: string };
    providers: (string | null)[];
    first_date: Date;
    last_date: Date;
    days: Date[];
    spend_usd: number;
    provider_fee_usd: number;
    total_spend_usd: number;
    impressions: number;
    clicks_all: number;
    link_clicks: number;
    first_page_views: number;
    questionnaire_starts: number;
    leads_partial: number;
    add_to_carts: number;
    purchase_events: number;
    conversions: number;
    revenue_usd: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: { ad_name: '$ad_name', offer_name: '$offer_name' },
        providers: { $addToSet: '$provider_name' },
        first_date: { $min: '$report_date' },
        last_date: { $max: '$report_date' },
        days: { $addToSet: '$report_date' },
        spend_usd: { $sum: '$spend_usd' },
        provider_fee_usd: { $sum: '$provider_fee_usd' },
        total_spend_usd: { $sum: '$total_spend_usd' },
        impressions: { $sum: '$impressions' },
        clicks_all: { $sum: '$clicks_all' },
        link_clicks: { $sum: '$link_clicks' },
        first_page_views: { $sum: '$first_page_views' },
        questionnaire_starts: { $sum: '$questionnaire_starts' },
        leads_partial: { $sum: '$leads_partial' },
        add_to_carts: { $sum: '$add_to_carts' },
        purchase_events: { $sum: '$purchase_events' },
        conversions: { $sum: '$conversions' },
        revenue_usd: { $sum: '$revenue_usd' },
      },
    },
    { $sort: { total_spend_usd: -1, '_id.ad_name': 1, '_id.offer_name': 1 } },
  ]);

  // "active" is relative to the newest day anyone reported on in this result
  const latest = groups.reduce<number>((max, g) => Math.max(max, g.last_date.getTime()), 0);
  const activeSince = latest - ACTIVE_WINDOW_DAYS * DAY_MS;

  const rows: FunnelRow[] = groups.map((g) => {
    const spend_usd = round2(g.spend_usd);
    const total_spend_usd = round2(g.total_spend_usd);
    const revenue_usd = round2(g.revenue_usd);
    const net_profit_usd = round2(revenue_usd - total_spend_usd);
    return {
      ad_name: g._id.ad_name,
      offer_name: g._id.offer_name,
      providers: g.providers.filter((p): p is string => Boolean(p)).sort(),
      first_date: isoDay(g.first_date),
      last_date: isoDay(g.last_date),
      days: g.days.length,
      active: g.last_date.getTime() >= activeSince,

      spend_usd,
      provider_fee_usd: round2(g.provider_fee_usd),
      total_spend_usd,
      impressions: g.impressions,
      clicks_all: g.clicks_all,
      link_clicks: g.link_clicks,
      ctr_all: ratio(g.clicks_all, g.impressions, 100),
      cpc_usd: ratio(spend_usd, g.clicks_all),

      first_page_views: g.first_page_views,
      questionnaire_starts: g.questionnaire_starts,
      leads_partial: g.leads_partial,
      add_to_carts: g.add_to_carts,
      purchase_events: g.purchase_events,
      conversions: g.conversions,

      revenue_usd,
      net_profit_usd,
      cac_usd: ratio(total_spend_usd, g.conversions),
      roas_pct: ratio(net_profit_usd, total_spend_usd, 100),
    };
  });

  return {
    range: describeRange(query, bounds),
    filters: { ad: query.ad ?? null, offer: query.offer ?? null },
    rows,
    meta: {
      rows: rows.length,
      ads: new Set(rows.map((r) => r.ad_name)).size,
      inactive: rows.filter((r) => !r.active).length,
      active_window_days: ACTIVE_WINDOW_DAYS,
    },
  };
}
