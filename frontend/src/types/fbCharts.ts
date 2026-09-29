import type { DateRangeKey } from './facebook';

export interface AdRevenueSpend {
  ad_name: string;
  revenue_usd: number;
  total_spend_usd: number;
  spend_usd: number;
  link_clicks: number;
}

export interface AudienceBucketStat {
  bucket: string;
  label: string;
  link_clicks: number;
  impressions: number;
  spend_usd: number;
  conversions: number;
}

export interface FbChartsResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  revenue_vs_spend_by_ad: AdRevenueSpend[];
  audience_by_age: AudienceBucketStat[];
  audience_by_gender: AudienceBucketStat[];
  meta: { report_rows: number; audience_rows: number };
}
