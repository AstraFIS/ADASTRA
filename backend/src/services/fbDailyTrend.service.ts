import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import type { DateRangeKey } from '../types/facebook.js';
import { isoDay } from '../utils/dateRange.js';
import {
  dateMatch,
  describeRange,
  FEE_USD,
  num,
  reportBaseMatch,
  resolveReportBounds,
  TOTAL_SPEND,
  type FbStatisticsQuery,
} from './fbStatistics.service.js';

/** One reporting day, summed over every row that matched the filters. */
export interface DailyTrendPoint {
  date: string; // YYYY-MM-DD
  revenue_usd: number;
  spend_usd: number; // before provider fees
  provider_fee_usd: number;
  total_spend_usd: number; // spend_usd + provider_fee_usd
  gross_profit_usd: number; // revenue_usd − spend_usd
  net_profit_usd: number; // revenue_usd − total_spend_usd
  impressions: number;
  clicks_all: number;
  link_clicks: number;
  landing_page_views: number;
  // funnel stages
  first_page_views: number;
  questionnaire_starts: number;
  leads_partial: number;
  add_to_carts: number;
  purchase_events: number;
  conversions: number; // verified conversions (CV) used for CAC / ROAS
  cac_usd: number | null; // total_spend_usd ÷ conversions
  roas_pct: number | null; // net_profit_usd ÷ total_spend_usd × 100
  rows: number;
}

export interface FbDailyTrendResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  /** Ascending by date; only days that have rows (days with no data are absent, not zero). */
  daily: DailyTrendPoint[];
  meta: { rows: number; days: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getFbDailyTrend(query: FbStatisticsQuery): Promise<FbDailyTrendResult> {
  const baseMatch = reportBaseMatch(query);
  const bounds = await resolveReportBounds(query);
  const match = { ...baseMatch, ...dateMatch(bounds) };

  const days = await FacebookAdReport.aggregate<{
    _id: Date;
    revenue_usd: number;
    spend_usd: number;
    provider_fee_usd: number;
    total_spend_usd: number;
    impressions: number;
    clicks_all: number;
    link_clicks: number;
    landing_page_views: number;
    first_page_views: number;
    questionnaire_starts: number;
    leads_partial: number;
    add_to_carts: number;
    purchase_events: number;
    conversions: number;
    rows: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: '$report_date',
        revenue_usd: { $sum: num('revenue_usd') },
        spend_usd: { $sum: num('spend_usd') },
        provider_fee_usd: { $sum: FEE_USD },
        total_spend_usd: { $sum: TOTAL_SPEND },
        impressions: { $sum: num('impressions') },
        clicks_all: { $sum: num('clicks_all') },
        link_clicks: { $sum: num('link_clicks') },
        landing_page_views: { $sum: num('landing_page_views') },
        first_page_views: { $sum: num('first_page_views') },
        questionnaire_starts: { $sum: num('questionnaire_starts') },
        leads_partial: { $sum: num('leads_partial') },
        add_to_carts: { $sum: num('add_to_carts') },
        purchase_events: { $sum: num('purchase_events') },
        conversions: { $sum: num('conversions') },
        rows: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const daily: DailyTrendPoint[] = days.filter((d) => d._id instanceof Date).map((d) => {
    const revenue_usd = round2(d.revenue_usd);
    const spend_usd = round2(d.spend_usd);
    const total_spend_usd = round2(d.total_spend_usd);
    const net_profit_usd = round2(revenue_usd - total_spend_usd);
    return {
      date: isoDay(d._id),
      revenue_usd,
      spend_usd,
      provider_fee_usd: round2(d.provider_fee_usd),
      total_spend_usd,
      gross_profit_usd: round2(revenue_usd - spend_usd),
      net_profit_usd,
      impressions: d.impressions,
      clicks_all: d.clicks_all,
      link_clicks: d.link_clicks,
      landing_page_views: d.landing_page_views,
      first_page_views: d.first_page_views,
      questionnaire_starts: d.questionnaire_starts,
      leads_partial: d.leads_partial,
      add_to_carts: d.add_to_carts,
      purchase_events: d.purchase_events,
      conversions: d.conversions,
      cac_usd: d.conversions > 0 ? round2(total_spend_usd / d.conversions) : null,
      roas_pct: total_spend_usd > 0 ? round2((net_profit_usd / total_spend_usd) * 100) : null,
      rows: d.rows,
    };
  });

  return {
    range: describeRange(query, bounds),
    filters: { ad: query.ad ?? null, offer: query.offer ?? null },
    daily,
    meta: { rows: daily.reduce((n, d) => n + d.rows, 0), days: daily.length },
  };
}
