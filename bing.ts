import type { DateRangeKey, DateRangeOption } from './facebook';


/** KPI tiles. Spend / clicks / impressions from bing_ad_reports, funnel + revenue from bing_conversions. */
export interface BingStatistics {
  total_revenue: number;
  total_amount_spend: number;
  net_profit: number; // total_revenue − total_amount_spend
  roas_pct: number | null; // net_profit ÷ total_amount_spend × 100
  landing_page_views: number; // partner "Base" events
  link_clicks: number; // Bing Ads clicks
  impressions: number;
  purchases: number;
  cpc: number | null; // spend ÷ clicks
  ctr: number | null; // clicks ÷ impressions × 100
  cac: number | null; // spend ÷ purchases
  /** true when an offer filter is applied to a multi-offer landing page, so spend is a share estimate. */
  spend_estimated: boolean;
}

export interface BingDailyPoint {
  date: string;
  /** null = the partner export does not cover this day yet. */
  revenue_usd: number | null;
  /** null = the Bing Ads export does not cover this day yet. */
  spend_usd: number | null;
  gross_profit_usd: number | null; // revenue − spend
  clicks: number;
  landing_page_views: number;
  purchases: number;
}

/** One funnel table row: date × offer, offer, or campaign · ad group (depending on the view). */
export interface BingFunnelRow {
  date: string | null;
  label: string; // offer name, or ad group name
  sub_label: string | null; // campaign name in the ad-group view
  impressions: number;
  clicks: number;
  spend_usd: number | null; // null = Bing Ads export does not cover the row yet
  spend_estimated: boolean; // spend split from a multi-offer landing page by landing-page-view share
  base: number; // landing page views
  start_quiz: number;
  quiz_completed: number;
  lead: number;
  add_to_cart: number;
  purchase: number;
  revenue_usd: number | null; // null = partner export does not cover the row yet
  ctr: number | null;
  cpc_usd: number | null;
  cac_usd: number | null;
  roas_pct: number | null;
}

/** Partner-side breakdown (device / region); Bing's export has no such split for spend. */
export interface BingBreakdownItem {
  label: string;
  visitors: number; // distinct click ids
  landing_page_views: number;
  quiz_starts: number;
  purchases: number;
  revenue_usd: number;
}

export interface BingBreakdown {
  items: BingBreakdownItem[]; // known values, most valuable first
  unknown_visitors: number; // visitors the partner sent without this field
}

export interface BingDashboard {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { offer: string | null; campaign: string | null };
  options: { date_ranges: DateRangeOption[]; offers: string[]; campaigns: string[] };
  statistics: BingStatistics;
  daily: BingDailyPoint[];
  by_device: BingBreakdown;
  by_region: BingBreakdown;
  funnel: { by_date: BingFunnelRow[]; by_offer: BingFunnelRow[]; by_ad_group: BingFunnelRow[] };
  meta: {
    ad_rows: number;
    conversion_rows: number;
    /** "Oct 1–8, 2026" — extent of each collection; null when it is empty. */
    ads_period: string | null;
    partner_period: string | null;
    ads_through: string | null;
    partner_through: string | null;
    /** Partner events in the selection that carry no campaign / ad group. */
    unattributed_events: number;
  };
}
