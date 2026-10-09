import type { DateRangeKey } from './facebook';

export interface FunnelRow {
  ad_name: string;
  offer_name: string;
  providers: string[];
  first_date: string;
  last_date: string;
  days: number;
  active: boolean;

  spend_usd: number;
  provider_fee_usd: number;
  total_spend_usd: number;
  impressions: number;
  clicks_all: number;
  link_clicks: number;
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
}

export interface FbFunnelResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  rows: FunnelRow[];
  meta: { rows: number; ads: number; inactive: number; active_window_days: number };
}
