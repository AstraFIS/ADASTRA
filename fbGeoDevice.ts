import type { DateRangeKey } from './facebook';

export interface SegmentStat {
  key: string;
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
}

export interface FbGeoDeviceResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  by_region: SegmentStat[];
  by_device: SegmentStat[];
  meta: { report_rows: number; region_rows: number; device_rows: number };
}
