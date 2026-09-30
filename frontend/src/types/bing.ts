import type { DateRangeKey, DateRangeOption } from './facebook';

/** KPI tiles. Spend, link clicks, CPC and CTR come from the Bing Ads export, so they are zero / null until it is loaded. */
export interface BingStatistics {
  total_revenue: number;
  total_amount_spend: number;
  net_profit: number;
  roas_pct: number | null;
  landing_page_views: number;
  link_clicks: number;
  cpc: number | null;
  ctr: number | null;
}

export interface BingDailyPoint {
  date: string;
  revenue_usd: number;
  clicks: number;
  /** null until the Bing Ads export covers the day. */
  spend_usd: number | null;
  gross_profit_usd: number | null;
}

/** One funnel table row: a day × offer, or an offer summed over the period (`date` null). */
export interface BingFunnelRow {
  date: string | null;
  offer_name: string;
  clicks: number;
  base: number;
  start_quiz: number;
  quiz_completed: number;
  add_to_cart: number;
  purchase: number;
  revenue_usd: number;
  /** null = pending: the Bing Ads export does not cover every day of this row yet. */
  spend_usd: number | null;
  ctr: number | null;
  cpc_usd: number | null;
  cac_usd: number | null;
  roas_pct: number | null;
}

export interface BingAudienceBucket {
  label: string;
  link_clicks: number;
}

export interface BingDashboard {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { offer: string | null };
  options: { date_ranges: DateRangeOption[]; offers: string[] };
  statistics: BingStatistics;
  daily: BingDailyPoint[];
  audience_by_age: BingAudienceBucket[];
  audience_by_gender: BingAudienceBucket[];
  funnel: { by_date: BingFunnelRow[]; by_offer: BingFunnelRow[] };
  meta: { partner_rows: number; ad_rows: number; partner_period: string | null; data_through: string | null };
}
