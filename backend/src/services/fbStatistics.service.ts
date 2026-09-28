import type { QueryFilter } from 'mongoose';
import { FacebookAdReport, type IFacebookAdReport } from '../models/facebookAdReport.model.js';
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

type ReportFilter = QueryFilter<IFacebookAdReport>;

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

export async function getFbStatistics(query: FbStatisticsQuery): Promise<FbStatisticsResult> {
  const baseMatch: ReportFilter = {};
  if (query.ad) baseMatch.ad_name = query.ad;
  if (query.offer) baseMatch.offer_name = query.offer;

  // Named ranges are anchored on the latest reported day (within the same ad/offer filter),
  // so "This Month" means the month the data was last updated, not the server clock.
  let bounds: { from: string; to: string } | null;
  if (query.from || query.to) {
    const latest = await FacebookAdReport.findOne(baseMatch).sort({ report_date: -1 }).select('report_date');
    bounds = {
      from: query.from ?? '0001-01-01',
      to: query.to ?? (latest ? isoDay(latest.report_date) : '9999-12-31'),
    };
  } else {
    const latest = await FacebookAdReport.findOne(baseMatch).sort({ report_date: -1 }).select('report_date');
    bounds = latest ? resolveRange(query.range, isoDay(latest.report_date)) : null;
  }

  const match: ReportFilter = { ...baseMatch };
  if (bounds) match.report_date = { $gte: toDate(bounds.from), $lte: toDate(bounds.to, true) };

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

  const label = DATE_RANGE_OPTIONS.find((o) => o.key === query.range)?.label ?? query.range;
  const range = { key: query.range, label, from: bounds?.from ?? null, to: bounds?.to ?? null };
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
