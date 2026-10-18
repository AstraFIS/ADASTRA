import { Schema, model, type Model } from 'mongoose';
import { parseDayMonthYear } from '../utils/bingDate.js';
import { normalizeBuyer } from '../utils/bingBuyer.js';

/**
 * Bing Ads "Search terms" report, one document per day × campaign × ad group × keyword × search term × match type.
 * Source: the search term export (CSV/XLSX) → tools/bing/build_search_terms.py → `npm run import:bing`.
 *
 * Columns of the export → fields:
 *   Date → report_date · Search term → search_term · Added / Excluded → added_excluded
 *   Match type → match_type ("exact", "phrase" …) + close_variant (true for "Exact (close variant)")
 *   Campaign → campaign_name · Campaign Type → campaign_type · Ad group → ad_group_name · Keyword text → keyword
 *   Spend → spend_usd · Clicks → clicks · Impr. → impressions · CTR → ctr_pct · Avg. CPC → cpc_usd · Avg. CPM → cpm_usd
 *   Top impr. rate → top_impr_rate_pct · Abs. top impr. rate → abs_top_impr_rate_pct
 *   Conv. → conversions · All conv. → all_conversions · Media Buyer → media_buyer ("TH02" → "TH2")
 *
 * Connected on the dashboard (no copies stored here):
 *   - bing_keyword_reports on campaign · ad group · keyword → bid and Conversion Name (the keyword report's Goal)
 *   - bing_conversions     on campaign · ad group · keyword → partner LP views, purchases, revenue
 * Rates are stored as 0–100 ("100%" in the export → 100).
 */
export interface IBingSearchTerm {
  report_date: Date;
  search_term: string;
  added_excluded: string | null;
  match_type: string | null;
  close_variant: boolean;
  campaign_name: string;
  campaign_type: string | null;
  ad_group_name: string;
  keyword: string;
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr_pct: number | null;
  cpc_usd: number | null;
  cpm_usd: number | null;
  top_impr_rate_pct: number | null;
  abs_top_impr_rate_pct: number | null;
  conversions: number;
  all_conversions: number;
  media_buyer: string | null;
}

const label = { type: String, required: true, trim: true, maxlength: 300 };
const optional = { type: String, trim: true, maxlength: 300, default: null };
const count = { type: Number, required: true, min: 0, default: 0 };
const optionalNumber = { type: Number, default: null };

const bingSearchTermSchema = new Schema<IBingSearchTerm>(
  {
    report_date: { type: Date, required: true, set: parseDayMonthYear }, // Date, "DD/MM/YYYY" or "YYYY-MM-DD"
    search_term: label,
    added_excluded: optional,
    match_type: { ...optional, set: (v: unknown) => (typeof v === 'string' ? v.split('(')[0]!.trim().toLowerCase() || null : v) },
    close_variant: { type: Boolean, default: false },
    campaign_name: label,
    campaign_type: optional,
    ad_group_name: label,
    keyword: label,
    impressions: count,
    clicks: count,
    spend_usd: count,
    ctr_pct: optionalNumber,
    cpc_usd: optionalNumber,
    cpm_usd: optionalNumber,
    top_impr_rate_pct: optionalNumber,
    abs_top_impr_rate_pct: optionalNumber,
    conversions: count,
    all_conversions: count,
    media_buyer: { ...optional, maxlength: 20, set: (v: unknown) => (typeof v === 'string' ? (normalizeBuyer(v) ?? (v.trim() || null)) : v) },
  },
  { collection: 'bing_search_terms', timestamps: true },
);

bingSearchTermSchema.index(
  { report_date: 1, campaign_name: 1, ad_group_name: 1, keyword: 1, search_term: 1, match_type: 1, close_variant: 1 },
  { unique: true },
);
bingSearchTermSchema.index({ media_buyer: 1, report_date: 1 });

export const BingSearchTerm: Model<IBingSearchTerm> = model<IBingSearchTerm>('BingSearchTerm', bingSearchTermSchema);
