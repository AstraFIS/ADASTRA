import type { DateRangeKey, MetricComparison } from './facebook';

export interface AdStatistics {
  amount_spent: number;
  link_clicks: number;
  /** Percentage number, e.g. 3.4 for 3.4 % */
  ctr: number | null;
  cpc: number | null;
  cac: number | null;
  /** Percentage number, e.g. 18.69 for 18.69 % */
  roas: number | null;
  revenue: number;
  spend_before_fees: number;
  provider_fees: number;
  net_profit: number;
  impressions: number;
  clicks_all: number;
  conversions: number;
  landing_page_views: number;
}

export interface FbAdStatisticsResult {
  ad: {
    ad_name: string;
    offers: string[];
    providers: string[];
    campaigns: string[];
    first_date: string | null;
    last_date: string | null;
    days: number;
    active: boolean;
  };
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  statistics: AdStatistics;
  account: { ctr: number | null; cpc: number | null; cac: number | null };
  comparisons: { ctr: MetricComparison | null; cpc: MetricComparison | null; cac: MetricComparison | null };
  meta: { rows: number; account_rows: number };
}
