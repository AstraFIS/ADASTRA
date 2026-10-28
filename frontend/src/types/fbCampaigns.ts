import type { DateRangeKey } from './facebook';

/** Totals for one row of the "By campaign" table (campaign, ad set or ad). */
export interface CampaignMetrics {
  spend_usd: number;
  provider_fee_usd: number;
  total_spend_usd: number;
  impressions: number;
  reach: number;
  clicks_all: number;
  link_clicks: number;
  landing_page_views: number;
  ctr_all: number | null;
  cpc_usd: number | null;
  first_page_views: number;
  questionnaire_starts: number;
  questionnaire_completed: number;
  add_to_carts: number;
  purchase_events: number;
  conversions: number;
  revenue_usd: number;
  net_profit_usd: number;
  cac_usd: number | null;
  roas_pct: number | null;
  first_date: string | null;
  last_date: string | null;
  /** Partner results were shared out over several Facebook rows by link-click share. */
  estimated: boolean;
}

export interface CampaignAdRow extends CampaignMetrics {
  ad_name: string;
  offer_name: string;
  providers: string[];
}

export interface CampaignAdSetRow extends CampaignMetrics {
  ad_set_name: string;
  offers: string[];
  ads: CampaignAdRow[];
}

export interface CampaignRow extends CampaignMetrics {
  campaign_name: string;
  offers: string[];
  providers: string[];
  ad_sets: CampaignAdSetRow[];
}

export interface FbCampaignsResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  campaigns: CampaignRow[];
  meta: { campaigns: number; ad_sets: number; ads: number; estimated_ads: number };
}
