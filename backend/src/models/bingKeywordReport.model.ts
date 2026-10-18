import { Schema, model, type Model } from 'mongoose';
import { parseDayMonthYear } from '../utils/bingDate.js';
import { normalizeBuyer } from '../utils/bingBuyer.js';

/**
 * Bing Ads keyword / search term report, one document per day × campaign × ad group × keyword × match type
 * (× search term, when the export has a "Search term" column).
 * Source: the keyword export (XLSX/CSV) → tools/bing/build_keywords.py → `npm run import:bing`.
 *
 * Columns of the export → fields:
 *   Day → report_date · Keyword → keyword · Search term → search_term (optional) · Goal → goal (empty → null)
 *   Campaign → campaign_name
 *   Ad group → ad_group_name · Match type → match_type · Bid → bid_usd · Clicks → clicks
 *   Impr. → impressions · CTR → ctr_pct · Avg. CPC → cpc_usd · Spend → spend_usd
 *   Top impr. rate → top_impr_rate_pct · Abs. top impr. rate → abs_top_impr_rate_pct
 *   Conv. → conversions · All conv. → all_conversions · Media Buyer → media_buyer ("TH02" is stored as "TH2")
 *
 * Bing segments the report by conversion goal: per keyword-day, the row with Goal "-" (stored as null)
 * carries impressions / clicks / spend, and one row per goal carries that goal's conversions with no spend.
 * They are separate documents (goal is part of the key); the dashboard adds them back up per keyword.
 *
 * Rates are stored as percentages (0–100). The export gives fractions (0.5 = 50 %); the builder
 * converts them, and the dashboard also reads a stored value ≤ 1 as a fraction, so documents
 * loaded straight through Compass still show correctly. CTR / CPC are recomputed from
 * clicks / impressions / spend when rows are summed.
 */
export interface IBingKeywordReport {
  report_date: Date;
  keyword: string;
  search_term: string | null; // what the user actually typed; null when the export has no such column
  goal: string | null; // conversion goal name (Purchase, Quiz Started …); null on the delivery row
  conversions: number; // Bing "Conv."
  all_conversions: number; // Bing "All conv."
  campaign_name: string;
  ad_group_name: string;
  match_type: string | null; // "exact" | "phrase" | "broad"
  bid_usd: number | null;
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr_pct: number | null;
  cpc_usd: number | null;
  top_impr_rate_pct: number | null;
  abs_top_impr_rate_pct: number | null;
  media_buyer: string | null; // "TH", "TH2" …; unknown codes are kept as typed
}

const label = { type: String, required: true, trim: true, maxlength: 300 };
const optional = { type: String, trim: true, maxlength: 300, default: null };
const count = { type: Number, required: true, min: 0, default: 0 };
const optionalNumber = { type: Number, default: null };

const bingKeywordReportSchema = new Schema<IBingKeywordReport>(
  {
    report_date: { type: Date, required: true, set: parseDayMonthYear }, // Date or "DD/MM/YYYY"
    keyword: label,
    search_term: optional,
    goal: { ...optional, set: (v: unknown) => (typeof v === 'string' && ['-', '--', ''].includes(v.trim()) ? null : v) },
    conversions: count,
    all_conversions: count,
    campaign_name: label,
    ad_group_name: label,
    match_type: { ...optional, set: (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() || null : v) },
    bid_usd: optionalNumber,
    impressions: count,
    clicks: count,
    spend_usd: count,
    ctr_pct: optionalNumber,
    cpc_usd: optionalNumber,
    top_impr_rate_pct: optionalNumber,
    abs_top_impr_rate_pct: optionalNumber,
    media_buyer: { ...optional, maxlength: 20, set: (v: unknown) => (typeof v === 'string' ? (normalizeBuyer(v) ?? (v.trim() || null)) : v) },
  },
  { collection: 'bing_keyword_reports', timestamps: true },
);

bingKeywordReportSchema.index(
  { report_date: 1, campaign_name: 1, ad_group_name: 1, keyword: 1, match_type: 1, search_term: 1, goal: 1 },
  { unique: true },
);
bingKeywordReportSchema.index({ media_buyer: 1, report_date: 1 });

export const BingKeywordReport: Model<IBingKeywordReport> = model<IBingKeywordReport>('BingKeywordReport', bingKeywordReportSchema);
