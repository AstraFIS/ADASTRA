/** GET /api/platforms/facebook/insights — mirrors backend/src/services/fbInsights.service.ts */

export type Verdict =
  | 'Scale'
  | 'Keep & watch'
  | 'Over break-even'
  | 'Promising'
  | 'Still testing'
  | 'Near cut'
  | 'Cut'
  | 'No purchase data yet';

export type NewDecision = 'Scale' | 'Turn back on' | 'Keep' | 'Watch' | 'Too early' | 'Not spending' | 'Cut' | 'No tracking';

export interface InsightCreative {
  ad: string;
  product: string;
  verdict: Verdict;
  cost: number;
  purchases: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
  add_to_carts: number;
  cost_per_atc: number | null;
  quiz_start_rate: number | null;
  ctr: number | null;
  cpm: number | null;
  impressions: number;
  link_clicks: number;
  first_views: number;
  days_live: number;
  first_day: string;
  last_day: string;
  live_last7: boolean;
  days_with_purchase: number;
  purchase_day_rate: number;
  spend_to_first_purchase: number | null;
  cost_last7: number;
  purchases_last7: number;
  accounts: string[];
  campaigns: number;
  format: string | null;
  hook_type: string | null;
  angle: string | null;
  offer_type: string | null;
  cta: string | null;
  /** Trait value per dimension, as grouped in `traits` (ED creatives with taxonomy). */
  traits: Record<string, string>;
  /** Ad groups page links; null = none saved. Field null = use creatives.json, "" = cleared. */
  links: { image: string | null; video: string | null; landing: string | null } | null;
  earlier_name: string | null;
  new_decision: NewDecision | null;
  new_why: string | null;
}

export interface InsightRow {
  label: string;
  ads: number;
  cost: number;
  purchases: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
  add_to_carts: number;
  cost_per_atc: number | null;
  impressions: number;
  link_clicks: number;
  ctr: number | null;
  cpm: number | null;
  quiz_start_rate: number | null;
}

export interface FbInsightsResult {
  range: { key: string; label: string; from: string | null; to: string | null };
  data_through: string | null;
  last7_from: string | null;
  break_even_cpa: number;
  break_even_is_fallback: boolean;
  totals: InsightRow & { break_even_cpa: number };
  last7: { cost: number; purchases: number; cpa: number | null; revenue: number };
  products: InsightRow[];
  funnel: { step: string; count: number; rate_from_prev: number | null; cost_per: number | null }[];
  weekly: { week: string; cost: number; revenue: number; purchases: number; add_to_carts: number; cpa: number | null; roas: number | null }[];
  creatives: InsightCreative[];
  traits: (InsightRow & { dimension: string })[];
  spend_levels: { bucket: string; ads: number; ads_with_sale: number; cost: number; purchases: number; purchases_per_1k: number | null }[];
  ad_age: { stage: string; cost: number; purchases: number; add_to_carts: number; cpa: number | null; ctr: number | null }[];
  segments: (InsightRow & { level: 'campaign' | 'adset'; product: string })[];
  audience: { age: string; gender: string; cost: number; share: number; ctr: number | null; cost_per_lpv: number | null }[];
  devices: { device: string; first_views: number; quiz_starts: number; add_to_carts: number; purchases: number; quiz_start_rate: number | null; purchases_per_1k_views: number | null }[];
  regions: { region: string; first_views: number; add_to_carts: number; purchases: number; purchases_per_1k_views: number | null }[];
  indicators: {
    ed_ads: number;
    ads_with_purchase: number;
    ads_under_break_even_spend: number;
    spend_under_break_even: number;
    median_spend_to_first_purchase: number | null;
    p90_spend_to_first_purchase: number | null;
    corr_ctr: number | null;
    corr_quiz_start: number | null;
    corr_atc: number | null;
    corr_ads: number;
  };
  unmatched: { ad_name: string; purchases: number; add_to_carts: number; revenue: number }[];
}
