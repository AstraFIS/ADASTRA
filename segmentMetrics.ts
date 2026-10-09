import type { SegmentStat } from '@/types/fbGeoDevice';

export type SegmentMetricKey =
  | 'first_page_views'
  | 'questionnaire_starts'
  | 'questionnaire_completed'
  | 'add_to_carts'
  | 'purchase_events'
  | 'revenue_usd';

export interface SegmentMetric {
  key: SegmentMetricKey;
  label: string;
  money?: boolean;
}

/** The funnel stages the country / device charts can be switched between. */
export const SEGMENT_METRICS: SegmentMetric[] = [
  { key: 'first_page_views', label: 'First Page View' },
  { key: 'questionnaire_starts', label: 'Q.S.' },
  { key: 'questionnaire_completed', label: 'Q.C.' },
  { key: 'add_to_carts', label: 'Add To Cart' },
  { key: 'purchase_events', label: 'Purchase' },
  { key: 'revenue_usd', label: 'Revenue', money: true },
];

export const metricValue = (s: SegmentStat, key: SegmentMetricKey): number => s[key];
