import type { DateRangeKey } from './facebook';

export interface FbStatistics {
  total_revenue: number;
  total_amount_spend: number;
  net_profit: number;
  landing_page_views: number;
  link_clicks: number;
  cpc: number | null;
  /** Percentage, e.g. 3.4 for 3.4 % */
  ctr: number | null;
}

export interface ProviderFeeStat {
  provider_name: string;
  /** Percentage number, e.g. 6.38 */
  fee_pct: number | null;
  amount_spent: number;
  provider_fee: number;
  total_with_fee: number;
  rows: number;
}

export interface FbStatisticsResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  statistics: FbStatistics;
  providers: ProviderFeeStat[];
  meta: { rows: number; ads: number; impressions: number; spend_before_fees: number; provider_fees: number };
}

export interface FbOptionsResult {
  dateRanges: { key: DateRangeKey; label: string }[];
  ads: string[];
  offers: string[];
  providers: string[];
  dataThrough: string | null;
  rows: number;
}
