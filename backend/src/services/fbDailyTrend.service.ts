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

/** One reporting day, summed over every row that matched the filters. */
export interface DailyTrendPoint {
  date: string; // YYYY-MM-DD
  revenue_usd: number;
  spend_usd: number; // before provider fees
  provider_fee_usd: number;
  total_spend_usd: number; // spend_usd + provider_fee_usd
  gross_profit_usd: number; // revenue_usd − spend_usd
  net_profit_usd: number; // revenue_usd − total_spend_usd
  link_clicks: number;
  conversions: number;
  cac_usd: number | null; // total_spend_usd ÷ conversions
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
  const bounds = await resolveReportBounds(query, baseMatch);
  const match = { ...baseMatch, ...dateMatch(bounds) };

  const days = await FacebookAdReport.aggregate<{
    _id: Date;
    revenue_usd: number;
    spend_usd: number;
    provider_fee_usd: number;
    total_spend_usd: number;
    link_clicks: number;
    conversions: number;
    rows: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: '$report_date',
        revenue_usd: { $sum: '$revenue_usd' },
        spend_usd: { $sum: '$spend_usd' },
        provider_fee_usd: { $sum: '$provider_fee_usd' },
        total_spend_usd: { $sum: '$total_spend_usd' },
        link_clicks: { $sum: '$link_clicks' },
        conversions: { $sum: '$conversions' },
        rows: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const daily: DailyTrendPoint[] = days.map((d) => {
    const revenue_usd = round2(d.revenue_usd);
    const spend_usd = round2(d.spend_usd);
    const total_spend_usd = round2(d.total_spend_usd);
    return {
      date: isoDay(d._id),
      revenue_usd,
      spend_usd,
      provider_fee_usd: round2(d.provider_fee_usd),
      total_spend_usd,
      gross_profit_usd: round2(revenue_usd - spend_usd),
      net_profit_usd: round2(revenue_usd - total_spend_usd),
      link_clicks: d.link_clicks,
      conversions: d.conversions,
      cac_usd: d.conversions > 0 ? round2(total_spend_usd / d.conversions) : null,
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
