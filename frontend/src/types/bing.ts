import type { BingBuyerFilter } from './auth';
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

/** Search term table row: campaign · ad group · keyword · match type (· search term), from bing_keyword_reports. */
export interface BingKeywordRow {
  keyword: string;
  search_term: string | null;
  goal: string | null;
  match_type: string | null;
  campaign_name: string;
  ad_group_name: string;
  media_buyer: string | null;
  bid_usd: number | null; // latest bid in the range
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr: number | null;
  cpc_usd: number | null;
  top_impr_rate_pct: number | null;
  abs_top_impr_rate_pct: number | null;
  active_days: number; // days with impressions
  conversions: number; // Bing "Conv."
  all_conversions: number; // Bing "All conv."
  /** Conversions per goal name (Purchase, Quiz Started …), most first. */
  conversion_goals: { name: string; conversions: number; all_conversions: number }[];
  /** Partner funnel joined on campaign · ad group · keyword. */
  landing_page_views: number;
  purchases: number;
  revenue_usd: number;
  roas_pct: number | null;
}

/** Search term report row (bing_search_terms), connected to the keyword report and the partner funnel. */
export interface BingSearchTermRow {
  search_term: string;
  keyword: string;
  match_type: string | null; // "exact" | "phrase" | "broad"
  close_variant: boolean; // "Exact (close variant)" in the export
  added_excluded: string | null;
  campaign_name: string;
  ad_group_name: string;
  media_buyer: string | null;
  /** Goals this term converted on: its keyword's goals on the days the term itself converted; null when none. */
  conversion_name: string | null;
  /** Same as conversion_name, as a list. */
  conversion_goals: string[];
  bid_usd: number | null;
  in_keyword_report: boolean;
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr: number | null;
  cpc_usd: number | null;
  cpm_usd: number | null;
  top_impr_rate_pct: number | null;
  abs_top_impr_rate_pct: number | null;
  conversions: number; // Bing "Conv."
  all_conversions: number; // Bing "All conv."
  /** Always 0 / null: partner results can't be tied to a search term — they are on the keyword rows. */
  landing_page_views: number;
  purchases: number;
  revenue_usd: number;
  roas_pct: number | null;
}

export interface BingDashboard {
  range: { key: DateRangeKey | 'custom'; label: string; from: string | null; to: string | null };
  filters: { offer: string | null; campaign: string | null; buyer: BingBuyerFilter | null };
  options: { date_ranges: DateRangeOption[]; offers: string[]; campaigns: string[]; buyers: BingBuyerFilter[] };
  statistics: BingStatistics;
  daily: BingDailyPoint[];
  geo: { by_region: BingSegment[]; by_device: BingSegment[] };
  /** Partner events in the selection with their click ids, newest first (max 5000). */
  clicks: BingClickRow[];
  funnel: { by_date: BingFunnelRow[]; by_offer: BingFunnelRow[]; by_ad_group: BingFunnelRow[] };
  /** Keyword report rows, highest spend first. */
  keywords: BingKeywordRow[];
  /** Search term report rows, highest spend first. */
  search_terms: BingSearchTermRow[];
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
    keyword_rows: number;
    keywords_period: string | null;
    search_term_rows: number;
    future_dated_through: string | null;
    search_terms_period: string | null;
  };
}
