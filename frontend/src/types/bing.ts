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

/** Partner-side region or device: event counts per funnel stage (Bing's export has no such split for spend). */
export interface BingSegment {
  key: string; // lower-case label, or "unknown" when the partner sent no value
  label: string;
  visitors: number; // distinct click ids
  first_page_views: number;
  questionnaire_starts: number;
  questionnaire_completed: number;
  leads: number;
  add_to_carts: number;
  purchase_events: number;
  revenue_usd: number;
}

/** One partner event with its click id, for the Click ID table. */
export interface BingClickRow {
  sub_id: string; // Bing click id (msclkid)
  date: string; // YYYY-MM-DD
  event_stage: 'first_page_view' | 'questionnaire_start' | 'questionnaire_completed' | 'lead' | 'add_to_cart' | 'purchase';
  event_raw: string; // the partner's own event name
  offer_name: string;
  region: string | null;
  device: string | null;
  campaign_name: string | null;
  ad_group_name: string | null;
  revenue_usd: number;
}

export interface BingDashboard {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { offer: string | null; campaign: string | null };
  options: { date_ranges: DateRangeOption[]; offers: string[]; campaigns: string[] };
  statistics: BingStatistics;
  daily: BingDailyPoint[];
  geo: { by_region: BingSegment[]; by_device: BingSegment[] };
  /** Partner events in the selection with their click ids, newest first (max 5000). */
  clicks: BingClickRow[];
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
