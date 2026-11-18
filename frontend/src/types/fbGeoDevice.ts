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

/** One ad's partner events on one placement (partner sub2). */
export interface AdPlacementStat {
  ad_name: string;
  placement: string;
  first_page_views: number;
  questionnaire_starts: number;
  questionnaire_completed: number;
  add_to_carts: number;
  purchase_events: number;
  revenue_usd: number;
}

export interface FbGeoDeviceResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  by_region: SegmentStat[];
  by_device: SegmentStat[];
  /** Partner sub2 (Meta placement); older API versions may not send it. */
  by_placement?: SegmentStat[];
  by_ad_placement?: AdPlacementStat[];
  meta: { report_rows: number; region_rows: number; device_rows: number; placement_rows?: number };
}
