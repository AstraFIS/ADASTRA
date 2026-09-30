import type { DateRangeKey, MetricComparison, ReadStatus } from './facebook';

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
  first_page_views: number;
  questionnaire_starts: number;
  leads_partial: number;
  add_to_carts: number;
  purchase_events: number;
}

export interface AdTestPlan {
  budget: string;
  increase: string;
  decrease: string;
  stop_rule: string;
}

/** Rule-based read of the ad's numbers for the selected range. */
export interface AdRecommendation {
  status: ReadStatus;
  status_label: string;
  summary: string;
  actions: string[];
  /** null when there is too little data to plan around. */
  test_plan: AdTestPlan | null;
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
  recommendation: AdRecommendation;
  meta: { rows: number; account_rows: number };
}
