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
  months: Record<string, { cost: number; revenue: number; profit: number }>;
  cost: number;
  revenue: number;
  profit: number;
}

export interface FinanceResult {
  range: { from: string; to: string }; // YYYY-MM, inclusive
  available: { from: string | null; to: string | null }; // months that have any data
  platforms: { facebook: boolean; bing: boolean };
  months: FinanceMonth[]; // oldest first
  totals: { facebook: FinanceFigures | null; bing: FinanceFigures | null; total: FinanceFigures };
  providers: FinanceProviderRow[];
  offers: FinanceOfferRow[];
}
