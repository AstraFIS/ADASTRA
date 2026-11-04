/** One platform (or the total) for one month on the Finance page. */
export interface FinanceFigures {
  spend: number; // media spend before provider fees
  fees: number; // provider fees (Facebook only; Bing has none)
  cost: number; // spend + fees
  revenue: number;
  profit: number; // revenue − cost
  roas_pct: number | null; // profit ÷ cost × 100
  margin_pct: number | null; // profit ÷ revenue × 100
  purchases: number;
  leads: number; // add-to-cart events
  cac: number | null; // cost ÷ purchases
}

export interface FinanceMonth {
  month: string; // YYYY-MM
  label: string; // "Oct 2026"
  facebook: FinanceFigures | null; // null when the caller has no access to the platform
  bing: FinanceFigures | null;
  total: FinanceFigures;
}

export interface FinanceProviderRow {
  provider_name: string; // "No provider" for spend without one
  fee_pct: number | null;
  no_provider: boolean;
  months: Record<string, { spend: number; fee: number }>;
  spend: number;
  fee: number;
}

export interface FinanceOfferRow {
  offer_name: string;
  platform: 'facebook' | 'bing';
  /** From partner_offers (Ad groups page); null = not assigned yet. */
  partner_name: string | null;
  partner_login: string | null;
  months: Record<string, { cost: number; revenue: number; profit: number }>;
  cost: number;
  revenue: number;
  profit: number;
  purchases: number;
}

/** Revenue / cost / profit / purchases of one partner or login on one platform. */
export interface FinancePlatformSplit {
  revenue: number;
  cost: number;
  profit: number;
  purchases: number;
}

/** One partner's totals over the period, split by platform, with a line per login. */
export interface FinancePartnerRow {
  partner_name: string | null; // null = offers not assigned to a partner yet
  revenue: number;
  cost: number;
  profit: number;
  purchases: number;
  by_platform: { facebook: FinancePlatformSplit; bing: FinancePlatformSplit };
  share_of_revenue_pct: number | null;
  logins: {
    partner_login: string | null;
    revenue: number;
    cost: number;
    profit: number;
    purchases: number;
    by_platform: { facebook: FinancePlatformSplit; bing: FinancePlatformSplit };
    offers: number;
  }[];
}

export interface FinanceResult {
  range: { from: string; to: string }; // YYYY-MM, inclusive
  available: { from: string | null; to: string | null }; // months that have any data
  platforms: { facebook: boolean; bing: boolean };
  months: FinanceMonth[]; // oldest first
  totals: { facebook: FinanceFigures | null; bing: FinanceFigures | null; total: FinanceFigures };
  providers: FinanceProviderRow[];
  offers: FinanceOfferRow[];
  partners: FinancePartnerRow[];
}
