import { Schema, model, type Model } from 'mongoose';
import { parseDayMonthYear } from '../utils/bingDate.js';

export const FB_EVENT_STAGES = [
  'presell_visit',
  'first_page_view',
  'questionnaire_start',
  'questionnaire_completed',
  'add_to_cart',
  'purchase',
] as const;
export type FbEventStage = (typeof FB_EVENT_STAGES)[number];

/**
 * Partner conversion export for Facebook traffic, one document per day × ad × event
 * (`event_count` events on that day). Joined live with facebook_ad_reports on
 * day + ad name by reportAggregate() — see fbStatistics.service.ts.
 *
 * `event_stage` is the cleaned funnel step; `event_raw` keeps the partner's own name
 * ("Lead / Partial" → questionnaire_completed, "AddToCart" → add_to_cart, …).
 */
export interface IFacebookConversion {
  event_date: Date; // stored as a Date, or "DD/MM/YYYY" text when pasted in by hand
  offer_name: string;
  event_raw: string;
  event_stage: FbEventStage;
  sub_id: string | null; // partner sub4: "<facebook ad id>_<ad name>"
  fb_ad_id: string | null;
  ad_name: string; // same spelling as the Facebook export's "Ad name"
  event_count: number;
  revenue_usd: number;
  device: string | null;
  region: string | null;
  /** Meta group set by hand on this row (Ad groups → Rows without an ad name); overrides ad_access. */
  access_group?: string | null;
}

const optional = { type: String, trim: true, maxlength: 300, default: null };

const facebookConversionSchema = new Schema<IFacebookConversion>(
  {
    event_date: { type: Date, required: true, set: parseDayMonthYear },
    offer_name: { type: String, required: true, trim: true, maxlength: 300 },
    event_raw: { type: String, required: true, trim: true, maxlength: 100 },
    event_stage: { type: String, required: true, enum: FB_EVENT_STAGES },
    sub_id: optional,
    fb_ad_id: optional,
    ad_name: { type: String, required: true, trim: true, maxlength: 300 },
    event_count: { type: Number, required: true, min: 0, default: 1 },
    revenue_usd: { type: Number, required: true, min: 0, default: 0 },
    device: optional,
    region: optional,
    access_group: { type: String, trim: true, maxlength: 50, default: undefined },
  },
  { collection: 'facebook_conversions', timestamps: true },
);

facebookConversionSchema.index({ event_date: 1, ad_name: 1 });
facebookConversionSchema.index({ event_stage: 1 });

export const FacebookConversion: Model<IFacebookConversion> = model<IFacebookConversion>(
  'FacebookConversion',
  facebookConversionSchema,
);
