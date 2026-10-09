import { Schema, model, type Model } from 'mongoose';
import { parseDayMonthYear } from '../utils/bingDate.js';

/**
 * Bing Ads export, one document per day × campaign × ad group × ad.
 * Source: the Bing Ads "Ad" report (CSV), loaded with `npm run import:bing -w backend`.
 * Bing reports no device / region / offer here — those come from bing_conversions.
 */
export interface IBingAdReport {
  report_date: Date;
  campaign_name: string;
  ad_group_name: string;
  match_type: string | null; // "phrase" | "exact" | … parsed from "PM | OTC | keyword"
  theme: string | null; // "OTC", "CON", "PRF", …
  keyword: string | null;
  ad_key: string; // stable id of the ad creative (see bing_ads)
  /**
   * Where the ad lands: a partner offer name when the ad links straight to that offer,
   * otherwise the landing page name (e.g. "MenCare Vault (multi-offer LP)").
   */
  offer_name: string;
  landing_domain: string | null;
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr_pct: number | null;
  cpc_usd: number | null;
  top_impr_rate_pct: number | null;
  abs_top_impr_rate_pct: number | null;
}

const label = { type: String, required: true, trim: true, maxlength: 300 };
const optional = { type: String, trim: true, maxlength: 300, default: null };
const count = { type: Number, required: true, min: 0, default: 0 };

const bingAdReportSchema = new Schema<IBingAdReport>(
  {
    report_date: { type: Date, required: true, set: parseDayMonthYear }, // Date or "DD/MM/YYYY"
    campaign_name: label,
    ad_group_name: label,
    match_type: optional,
    theme: optional,
    keyword: optional,
    ad_key: { type: String, required: true, maxlength: 64 },
    offer_name: label,
    landing_domain: optional,
    impressions: count,
    clicks: count,
    spend_usd: count,
    ctr_pct: { type: Number, default: null },
    cpc_usd: { type: Number, default: null },
    top_impr_rate_pct: { type: Number, default: null },
    abs_top_impr_rate_pct: { type: Number, default: null },
  },
  { collection: 'bing_ad_reports', timestamps: true },
);

bingAdReportSchema.index({ report_date: 1, campaign_name: 1, ad_group_name: 1, ad_key: 1 }, { unique: true });

export const BingAdReport: Model<IBingAdReport> = model<IBingAdReport>('BingAdReport', bingAdReportSchema);
