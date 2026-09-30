import type { DateRangeKey, DateRangeOption } from './facebook.js';

/** One day of one offer from the partner conversion export. */
export interface BingPartnerRow {
  date: string; // YYYY-MM-DD
  offer: string;
  clicks: number; // clicks the partner tracked
  base: number; // landing page views
  startQuiz: number;
  quizCompleted: number;
  addToCart: number;
  purchase: number;
  revenue: number;
}

/** One day of one offer from the Bing Ads spend / impression export. */
export interface BingAdRow {
  date: string; // YYYY-MM-DD
  offer: string;
  spend: number;
  impressions: number;
  clicks: number;
}

export interface BingDashboardQuery {
  range: DateRangeKey;
  offer?: string | undefined;
}

/** KPI tiles. Spend, link clicks, CPC and CTR come from the Bing Ads export, so they are zero / null until it is loaded. */
export interface BingStatistics {
  total_revenue: number; // Σ partner revenue
  total_amount_spend: number; // Σ Bing Ads spend
  net_profit: number; // total_revenue − total_amount_spend
  roas_pct: number | null; // net_profit ÷ total_amount_spend × 100, null without spend
  landing_page_views: number; // Σ partner base
  link_clicks: number; // Σ Bing Ads clicks
  cpc: number | null; // spend ÷ link clicks, null without clicks
  ctr: number | null; // link clicks ÷ impressions × 100, null without impressions
}

export interface BingDailyPoint {
  date: string;
  revenue_usd: number;
  clicks: number;
  /** null until the Bing Ads export covers the day. */
  spend_usd: number | null;
  gross_profit_usd: number | null; // revenue − spend
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
  ctr: number | null; // Bing Ads clicks ÷ impressions × 100
  cpc_usd: number | null; // spend ÷ Bing Ads clicks
  cac_usd: number | null; // spend ÷ purchases
  roas_pct: number | null; // (revenue − spend) ÷ spend × 100
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
  daily: BingDailyPoint[]; // ascending by date; only days that have partner rows
  audience_by_age: BingAudienceBucket[];
  audience_by_gender: BingAudienceBucket[];
  funnel: { by_date: BingFunnelRow[]; by_offer: BingFunnelRow[] };
  meta: {
    partner_rows: number;
    ad_rows: number;
    /** Extent of the whole partner export, e.g. "Sep 19–24, 2026"; null when it is empty. */
    partner_period: string | null;
    data_through: string | null;
  };
}
