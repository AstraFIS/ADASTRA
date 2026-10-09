import type { DateRangeKey } from '../types/facebook.js';
import {
  dateMatch,
  describeRange,
  type FbStatisticsQuery,
  num,
  reportAggregate,
  reportBaseMatch,
  resolveReportBounds,
  TOTAL_SPEND,
} from './fbStatistics.service.js';

export interface SegmentStat {
  key: string; // normalised (lower-case) key, "unknown" when the source had no value
  label: string; // display text, e.g. "United States", "Mobile"
  rows: number;
  impressions: number;
  link_clicks: number;
  first_page_views: number;
  questionnaire_starts: number;
  questionnaire_completed: number;
  add_to_carts: number;
  purchase_events: number;
  conversions: number;
  spend_usd: number;
  total_spend_usd: number;
  revenue_usd: number;
}

export interface FbGeoDeviceResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  by_region: SegmentStat[]; // sorted by link clicks, descending
  by_device: SegmentStat[];
  meta: { report_rows: number; region_rows: number; device_rows: number };
}

type Segment = 'region' | 'device';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The stored column is "Region" / "Device" in sheet imports and may be lower-case
 * in rows written by the app, so both spellings are read.
 */
const rawField = (segment: Segment) => {
  const capitalised = segment === 'region' ? '$Region' : '$Device';
  return { $trim: { input: { $toString: { $ifNull: [capitalised, { $ifNull: [`$${segment}`, ''] }] } } } };
};

const UNKNOWN_TOKENS = ['', 'unknown', 'not available', 'notavailable', 'n/a', 'na', 'null', 'undefined', '-', 'none'];

async function groupBySegment(segment: Segment, match: Record<string, unknown>): Promise<SegmentStat[]> {
  const rows = await reportAggregate<{
    _id: string;
    label: string;
    rows: number;
    impressions: number;
    link_clicks: number;
    first_page_views: number;
    questionnaire_starts: number;
    questionnaire_completed: number;
    add_to_carts: number;
    purchase_events: number;
    conversions: number;
    spend_usd: number;
    total_spend_usd: number;
    revenue_usd: number;
  }>([
    { $match: match },
    { $addFields: { _seg: rawField(segment) } },
    {
      $group: {
        // case-insensitive, so "Mobile" and "mobile" are one device
        _id: {
          $cond: [{ $in: [{ $toLower: '$_seg' }, UNKNOWN_TOKENS] }, 'unknown', { $toLower: '$_seg' }],
        },
        label: { $first: '$_seg' },
        rows: { $sum: 1 },
        impressions: { $sum: num('impressions') },
        link_clicks: { $sum: num('link_clicks') },
        first_page_views: { $sum: num('first_page_views') },
        questionnaire_starts: { $sum: num('questionnaire_starts') },
        questionnaire_completed: { $sum: num('questionnaire_completed') },
        add_to_carts: { $sum: num('add_to_carts') },
        purchase_events: { $sum: num('purchase_events') },
        conversions: { $sum: num('conversions') },
        spend_usd: { $sum: num('spend_usd') },
        total_spend_usd: { $sum: TOTAL_SPEND },
        revenue_usd: { $sum: num('revenue_usd') },
      },
    },
  ]);

  return rows
    .map(
      (r): SegmentStat => ({
        key: r._id,
        label: r._id === 'unknown' ? 'Unknown' : r.label,
        rows: r.rows,
        impressions: r.impressions,
        link_clicks: r.link_clicks,
        first_page_views: r.first_page_views,
        questionnaire_starts: r.questionnaire_starts,
        questionnaire_completed: r.questionnaire_completed,
        add_to_carts: r.add_to_carts,
        purchase_events: r.purchase_events,
        conversions: r.conversions,
        spend_usd: round2(r.spend_usd),
        total_spend_usd: round2(r.total_spend_usd),
        revenue_usd: round2(r.revenue_usd),
      }),
    )
    // "Unknown" goes last whatever its size
    .sort(
      (a, b) =>
        Number(a.key === 'unknown') - Number(b.key === 'unknown') ||
        b.link_clicks - a.link_clicks ||
        b.first_page_views - a.first_page_views ||
        a.label.localeCompare(b.label),
    );
}

export async function getFbGeoDevice(query: FbStatisticsQuery): Promise<FbGeoDeviceResult> {
  const baseMatch = reportBaseMatch(query);
  const bounds = await resolveReportBounds(query);
  const match = { ...baseMatch, ...dateMatch(bounds) };

  const [by_region, by_device] = await Promise.all([groupBySegment('region', match), groupBySegment('device', match)]);
  const known = (list: SegmentStat[]) => list.filter((s) => s.key !== 'unknown').reduce((n, s) => n + s.rows, 0);

  return {
    range: describeRange(query, bounds),
    filters: { ad: query.ad ?? null, offer: query.offer ?? null },
    by_region,
    by_device,
    meta: {
      report_rows: by_region.reduce((n, s) => n + s.rows, 0),
      region_rows: known(by_region),
      device_rows: known(by_device),
    },
  };
}
