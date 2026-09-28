import type { DateRangeKey } from './facebook';

export interface DailyTrendPoint {
  date: string;
  revenue_usd: number;
  spend_usd: number;
  provider_fee_usd: number;
  total_spend_usd: number;
  gross_profit_usd: number;
  net_profit_usd: number;
  link_clicks: number;
  conversions: number;
  cac_usd: number | null;
  rows: number;
}

export interface FbDailyTrendResult {
  range: { key: DateRangeKey; label: string; from: string | null; to: string | null };
  filters: { ad: string | null; offer: string | null };
  daily: DailyTrendPoint[];
  meta: { rows: number; days: number };
}
