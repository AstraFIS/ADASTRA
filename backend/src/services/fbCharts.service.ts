import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import {
  AGE_BUCKETS,
  FacebookAudienceReport,
  GENDER_BUCKETS,
  type AudienceBreakdown,
} from '../models/facebookAudienceReport.model.js';
import type { DateRangeKey } from '../types/facebook.js';
import {
  dateMatch,
  describeRange,
  reportBaseMatch,
  resolveReportBounds,
  type FbStatisticsQuery,
} from './fbStatistics.service.js';

export interface AdRevenueSpend {
  ad_name: string;
  revenue_usd: number;
  total_spend_usd: number; // grossed up with provider fees
  spend_usd: number; // before fees
  link_clicks: number;
}

export interface AudienceBucketStat {
  bucket: string; // stored key, e.g. "25-34", "male"
  label: string; // display label, e.g. "25–34", "Male"
  link_clicks: number;
  impressions: number;
}

export interface FbChartsResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  revenue_vs_spend_by_ad: AdRevenueSpend[]; // sorted by total spend, descending
  audience_by_age: AudienceBucketStat[]; // every bucket, zeros included, in chart order
  audience_by_gender: AudienceBucketStat[];
  meta: { report_rows: number; audience_rows: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getFbCharts(query: FbStatisticsQuery): Promise<FbChartsResult> {
  const baseMatch = reportBaseMatch(query);
  const bounds = await resolveReportBounds(query, baseMatch);
  const match = { ...baseMatch, ...dateMatch(bounds) };

  // ---- revenue vs spend per ad ----
  const byAd = await FacebookAdReport.aggregate<{
    _id: string;
    revenue_usd: number;
    total_spend_usd: number;
    spend_usd: number;
    link_clicks: number;
    rows: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: '$ad_name',
        revenue_usd: { $sum: '$revenue_usd' },
        total_spend_usd: { $sum: '$total_spend_usd' },
        spend_usd: { $sum: '$spend_usd' },
        link_clicks: { $sum: '$link_clicks' },
        rows: { $sum: 1 },
      },
    },
    { $sort: { total_spend_usd: -1, _id: 1 } },
  ]);

  // ---- audience: same ads and days; an offer filter is applied through the ads that ran it ----
  const audienceMatch: Record<string, unknown> = { ...dateMatch(bounds) };
  if (query.ad) audienceMatch.ad_name = query.ad;
  else if (query.offer) audienceMatch.ad_name = { $in: byAd.map((a) => a._id) };

  const audience = await FacebookAudienceReport.aggregate<{
    _id: { breakdown: AudienceBreakdown; bucket: string };
    link_clicks: number;
    impressions: number;
    rows: number;
  }>([
    { $match: audienceMatch },
    {
      $group: {
        _id: { breakdown: '$breakdown', bucket: '$bucket' },
        link_clicks: { $sum: '$link_clicks' },
        impressions: { $sum: '$impressions' },
        rows: { $sum: 1 },
      },
    },
  ]);

  const buckets = (breakdown: AudienceBreakdown, order: { key: string; label: string }[]): AudienceBucketStat[] => {
    const found = new Map(audience.filter((a) => a._id.breakdown === breakdown).map((a) => [a._id.bucket, a]));
    const known = order.map(({ key, label }) => ({
      bucket: key,
      label,
      link_clicks: found.get(key)?.link_clicks ?? 0,
      impressions: found.get(key)?.impressions ?? 0,
    }));
    // anything the source used that we don't know about is appended rather than dropped
    const extra = [...found.keys()]
      .filter((k) => !order.some((o) => o.key === k))
      .sort()
      .map((k) => ({ bucket: k, label: k, link_clicks: found.get(k)!.link_clicks, impressions: found.get(k)!.impressions }));
    return [...known, ...extra];
  };

  return {
    range: describeRange(query, bounds),
    filters: { ad: query.ad ?? null, offer: query.offer ?? null },
    revenue_vs_spend_by_ad: byAd.map((a) => ({
      ad_name: a._id,
      revenue_usd: round2(a.revenue_usd),
      total_spend_usd: round2(a.total_spend_usd),
      spend_usd: round2(a.spend_usd),
      link_clicks: a.link_clicks,
    })),
    audience_by_age: buckets('age', AGE_BUCKETS),
    audience_by_gender: buckets('gender', GENDER_BUCKETS),
    meta: {
      report_rows: byAd.reduce((n, a) => n + a.rows, 0),
      audience_rows: audience.reduce((n, a) => n + a.rows, 0),
    },
  };
}
