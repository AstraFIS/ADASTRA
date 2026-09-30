import { AGE_BUCKETS, FacebookAdReport, GENDER_BUCKETS } from '../models/facebookAdReport.model.js';
import type { DateRangeKey } from '../types/facebook.js';
import {
  dateMatch,
  describeRange,
  num,
  reportBaseMatch,
  resolveReportBounds,
  TOTAL_SPEND,
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
  bucket: string; // normalised key, e.g. "25-34", "male", "unknown"
  label: string; // display label, e.g. "25–34", "Male"
  link_clicks: number;
  impressions: number;
  spend_usd: number;
  conversions: number;
}

type AudienceBreakdown = 'age' | 'gender';

/**
 * Pipeline expression that normalises a stored age / gender value the same way
 * the model does on save, so rows imported directly ("Not available", "Male",
 * "18 – 24") land in the canonical buckets.
 */
function bucketExpr(field: 'age' | 'gender') {
  const lowered = { $toLower: { $trim: { input: { $toString: { $ifNull: [`$${field}`, ''] } } } } };
  const compact = {
    $replaceAll: {
      input: { $replaceAll: { input: { $replaceAll: { input: lowered, find: '–', replacement: '-' } }, find: '—', replacement: '-' } },
      find: ' ',
      replacement: '',
    },
  };
  return {
    $switch: {
      branches: [
        { case: { $in: [compact, ['', 'unknown', 'notavailable', 'not-available', 'n/a', 'na', 'null', 'undefined', '-']] }, then: 'unknown' },
      ],
      default: compact,
    },
  };
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
  const bounds = await resolveReportBounds(query);
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
        // $toString: names imported as numbers (an ad called 3.1) must still group and render as text
        _id: { $toString: '$ad_name' },
        revenue_usd: { $sum: num('revenue_usd') },
        total_spend_usd: { $sum: TOTAL_SPEND },
        spend_usd: { $sum: num('spend_usd') },
        link_clicks: { $sum: '$link_clicks' },
        rows: { $sum: 1 },
      },
    },
    { $sort: { total_spend_usd: -1, _id: 1 } },
  ]);

  // ---- audience: the same rows, grouped by their age / gender breakdown ----
  const groupBy = (field: AudienceBreakdown) =>
    FacebookAdReport.aggregate<{
      _id: string;
      link_clicks: number;
      impressions: number;
      spend_usd: number;
      conversions: number;
      rows: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: bucketExpr(field),
          link_clicks: { $sum: '$link_clicks' },
          impressions: { $sum: '$impressions' },
          spend_usd: { $sum: num('spend_usd') },
          conversions: { $sum: '$conversions' },
          rows: { $sum: 1 },
        },
      },
    ]).then((rows) => rows.map((r) => ({ ...r, _id: { breakdown: field, bucket: r._id } })));
  const audience = (await Promise.all([groupBy('age'), groupBy('gender')])).flat();

  const buckets = (breakdown: AudienceBreakdown, order: { key: string; label: string }[]): AudienceBucketStat[] => {
    const found = new Map(audience.filter((a) => a._id.breakdown === breakdown).map((a) => [a._id.bucket, a]));
    const stat = (key: string, label: string): AudienceBucketStat => ({
      bucket: key,
      label,
      link_clicks: found.get(key)?.link_clicks ?? 0,
      impressions: found.get(key)?.impressions ?? 0,
      spend_usd: round2(found.get(key)?.spend_usd ?? 0),
      conversions: found.get(key)?.conversions ?? 0,
    });
    const known = order.map(({ key, label }) => stat(key, label));
    // anything the source used that we don't know about is appended rather than dropped
    const extra = [...found.keys()]
      .filter((k) => !order.some((o) => o.key === k))
      .sort()
      .map((k) => stat(k, k));
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
      // rows carrying a known age or gender (i.e. not "unknown")
      audience_rows: audience.filter((a) => a._id.bucket !== 'unknown').reduce((n, a) => n + a.rows, 0),
    },
  };
}
