import { Schema, model, type Model } from 'mongoose';
import { parseDayMonthYear } from '../utils/bingDate.js';

export const BING_EVENT_STAGES = [
  'first_page_view',
  'questionnaire_start',
  'questionnaire_completed',
  'lead',
  'add_to_cart',
  'purchase',
] as const;
export type BingEventStage = (typeof BING_EVENT_STAGES)[number];

/**
 * Partner conversion export, one document per event.
 * `event_stage` is the cleaned funnel step; `event_raw` keeps the partner's original name
 * ("Start Quiz", "Satrt quiz", "start_intake" … all → questionnaire_start).
 * campaign / ad group are null when the partner did not pass them (events before Oct 5, 2026).
 */
export interface IBingConversion {
  event_date: Date;
  sub_id: string; // Bing click id (msclkid) the partner tracked
  event_raw: string;
  event_stage: BingEventStage;
  offer_name: string;
  event_count: number;
  revenue_usd: number;
  region: string | null;
  device: string | null;
  campaign_name: string | null;
  ad_group_name: string | null;
  match_type: string | null;
  theme: string | null;
  keyword: string | null;
  attributed: boolean;
}

const optional = { type: String, trim: true, maxlength: 300, default: null };

const bingConversionSchema = new Schema<IBingConversion>(
  {
    event_date: { type: Date, required: true, set: parseDayMonthYear }, // Date or "DD/MM/YYYY"
    sub_id: { type: String, required: true, maxlength: 100 },
    event_raw: { type: String, required: true, trim: true, maxlength: 100 },
    event_stage: { type: String, required: true, enum: BING_EVENT_STAGES },
    offer_name: { type: String, required: true, trim: true, maxlength: 300 },
    event_count: { type: Number, required: true, min: 0, default: 1 },
    revenue_usd: { type: Number, required: true, min: 0, default: 0 },
    region: optional,
    device: optional,
    campaign_name: optional,
    ad_group_name: optional,
    match_type: optional,
    theme: optional,
    keyword: optional,
    attributed: { type: Boolean, required: true, default: false },
  },
  { collection: 'bing_conversions', timestamps: true },
);

bingConversionSchema.index({ event_date: 1, event_stage: 1 });
bingConversionSchema.index({ event_date: 1, campaign_name: 1, ad_group_name: 1 });
bingConversionSchema.index({ sub_id: 1 });

export const BingConversion: Model<IBingConversion> = model<IBingConversion>('BingConversion', bingConversionSchema);
