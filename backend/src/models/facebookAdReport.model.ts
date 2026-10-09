import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * One reporting row: a Facebook ad on one day, within one campaign / ad set,
 * for one age band × gender (Facebook's demographic breakdown), with its
 * provider fee, funnel stages and outcome. Field names follow the source
 * sheet (snake_case) so an import maps 1:1.
 *
 * Derived fields (fee, total spend, CTR, CPC, profits, ROAS, CAC) are always
 * recomputed from the base numbers on save, so they cannot drift.
 */
/** Canonical bucket keys (as stored) and their display labels, in chart order. */
export const AGE_BUCKETS: { key: string; label: string }[] = [
  { key: '18-24', label: '18–24' },
  { key: '25-34', label: '25–34' },
  { key: '35-44', label: '35–44' },
  { key: '45-54', label: '45–54' },
  { key: '55-64', label: '55–64' },
  { key: '65+', label: '65+' },
  { key: 'unknown', label: 'Unknown' },
];
export const GENDER_BUCKETS: { key: string; label: string }[] = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'unknown', label: 'Unknown' },
];

// compared after lower-casing and removing spaces / dashes, so "Not available", "N/A", "n-a" all match
const UNKNOWN_TOKENS = new Set(['', 'unknown', 'notavailable', 'na', 'n/a', 'none', 'null', 'undefined']);

/** "Male" → "male", " 18 – 24 " → "18-24", "Not available" / "" → "unknown" */
export function normaliseBucket(raw: unknown): string {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, '');
  return UNKNOWN_TOKENS.has(v.replace(/-/g, '')) ? 'unknown' : v;
}

export interface IFacebookAdReport {
  report_date: Date;
  ad_name: string;
  offer_name: string;
  campaign_name: string;
  ad_set_name: string;
  provider_name: string | null; // null when no provider is attached
  age: string; // "18-24" … "65+", or "unknown" (normalised on save)
  gender: string; // "male" | "female" | "unknown" (normalised on save)

  // creative assets (optional; null when the source has none)
  image_url: string | null;
  video_url: string | null;

  // spend
  spend_usd: number; // before the provider fee
  provider_fee_pct: number; // e.g. 6.38 for 6.38 %
  provider_fee_usd: number; // spend_usd × provider_fee_pct ÷ 100
  total_spend_usd: number; // spend_usd + provider_fee_usd

  // delivery
  impressions: number;
  clicks_all: number;
  link_clicks: number;
  landing_page_views: number;
  ctr_all: number | null; // clicks_all ÷ impressions × 100
  cpc_usd: number | null; // spend_usd ÷ clicks_all

  // funnel
  presell_visits: number;
  first_page_views: number;
  questionnaire_starts: number;
  questionnaire_completed: number;
  add_to_carts: number;
  purchase_events: number;
  conversions: number; // verified conversions (CV), used for CAC

  // outcome
  revenue_usd: number;
  gross_profit_usd: number; // revenue_usd − spend_usd
  net_profit_usd: number; // revenue_usd − total_spend_usd
  roas_pct: number | null; // net_profit_usd ÷ total_spend_usd × 100
  cac_usd: number | null; // total_spend_usd ÷ conversions

  createdAt: Date;
  updatedAt: Date;
}

/** Base fields an importer supplies; everything else is derived. */
export type FacebookAdReportInput = Pick<
  IFacebookAdReport,
  | 'report_date'
  | 'ad_name'
  | 'offer_name'
  | 'campaign_name'
  | 'ad_set_name'
  | 'age'
  | 'gender'
  | 'spend_usd'
  | 'impressions'
  | 'clicks_all'
  | 'link_clicks'
  | 'landing_page_views'
  | 'presell_visits'
  | 'first_page_views'
  | 'questionnaire_starts'
  | 'questionnaire_completed'
  | 'add_to_carts'
  | 'purchase_events'
  | 'conversions'
  | 'revenue_usd'
> &
  Partial<Pick<IFacebookAdReport, 'provider_name' | 'provider_fee_pct' | 'image_url' | 'video_url'>>;

export type DerivedReportFields = Pick<
  IFacebookAdReport,
  | 'provider_fee_usd'
  | 'total_spend_usd'
  | 'ctr_all'
  | 'cpc_usd'
  | 'gross_profit_usd'
  | 'net_profit_usd'
  | 'roas_pct'
  | 'cac_usd'
>;

/** JSON shape returned by the API. */
export interface PublicFacebookAdReport
  extends Omit<IFacebookAdReport, 'report_date' | 'createdAt' | 'updatedAt'> {
  id: string;
  report_date: string; // YYYY-MM-DD
  updatedAt: string;
}

export interface FacebookAdReportModel extends Model<IFacebookAdReport> {
  deriveFields(base: DeriveInput): DerivedReportFields;
  /** Insert or update the row identified by (report_date, ad_name, campaign_name, ad_set_name). */
  upsertRow(input: FacebookAdReportInput): Promise<FacebookAdReportDocument>;
}

export type FacebookAdReportDocument = HydratedDocument<IFacebookAdReport>;

type DeriveInput = Pick<
  IFacebookAdReport,
  'spend_usd' | 'provider_fee_pct' | 'impressions' | 'clicks_all' | 'conversions' | 'revenue_usd'
>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (num: number, den: number, scale = 1): number | null => (den > 0 ? round2((num / den) * scale) : null);

export function deriveFields(b: DeriveInput): DerivedReportFields {
  const provider_fee_usd = round2((b.spend_usd * normaliseFeePct(b.provider_fee_pct)) / 100);
  const total_spend_usd = round2(b.spend_usd + provider_fee_usd);
  const gross_profit_usd = round2(b.revenue_usd - b.spend_usd);
  const net_profit_usd = round2(b.revenue_usd - total_spend_usd);
  return {
    provider_fee_usd,
    total_spend_usd,
    ctr_all: ratio(b.clicks_all, b.impressions, 100),
    cpc_usd: ratio(b.spend_usd, b.clicks_all),
    gross_profit_usd,
    net_profit_usd,
    roas_pct: ratio(net_profit_usd, total_spend_usd, 100),
    cac_usd: ratio(total_spend_usd, b.conversions),
  };
}

/** Optional text fields: "" and whitespace are stored as null. */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/**
 * provider_fee_pct is a percentage (6.38 means 6.38 %). Some imports store it
 * ×100 (753 for 7.53 %); a fee above 100 % is impossible, so anything over 100
 * is read as ×100 and scaled back.
 */
export function normaliseFeePct(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 100 ? Math.round(n) / 100 : n;
}

const count = { type: Number, required: true, min: 0, default: 0 };
const money = { type: Number, required: true, min: 0, default: 0 };
const derived = { type: Number }; // filled by the pre-validate hook (may be negative for profits)
const derivedNullable = { type: Number, min: 0 }; // null when the denominator is 0
const label = { type: String, required: true, trim: true, maxlength: 200 };

const facebookAdReportSchema = new Schema<IFacebookAdReport, FacebookAdReportModel>(
  {
    report_date: { type: Date, required: true },
    ad_name: label,
    offer_name: label,
    campaign_name: label,
    ad_set_name: label,
    provider_name: { type: String, trim: true, maxlength: 200, default: null },
    age: { type: String, required: true, maxlength: 20, default: 'unknown', set: normaliseBucket },
    gender: { type: String, required: true, maxlength: 20, default: 'unknown', set: normaliseBucket },
    image_url: { type: String, trim: true, maxlength: 2048, default: null, set: emptyToNull },
    video_url: { type: String, trim: true, maxlength: 2048, default: null, set: emptyToNull },

    spend_usd: money,
    provider_fee_pct: { type: Number, required: true, min: 0, max: 100, default: 0, set: normaliseFeePct },
    provider_fee_usd: derived,
    total_spend_usd: derived,

    impressions: count,
    clicks_all: count,
    link_clicks: count,
    landing_page_views: count,
    ctr_all: derivedNullable,
    cpc_usd: derivedNullable,

    presell_visits: count,
    first_page_views: count,
    questionnaire_starts: count,
    questionnaire_completed: count,
    add_to_carts: count,
    purchase_events: count,
    conversions: count,

    revenue_usd: money,
    gross_profit_usd: derived,
    net_profit_usd: derived,
    roas_pct: { type: Number }, // can be negative
    cac_usd: derivedNullable,
  },
  {
    collection: 'facebook_ad_reports',
    timestamps: true,
    statics: {
      deriveFields,
      async upsertRow(input: FacebookAdReportInput) {
        const key = {
          report_date: input.report_date,
          ad_name: input.ad_name.trim(),
          campaign_name: input.campaign_name.trim(),
          ad_set_name: input.ad_set_name.trim(),
          age: normaliseBucket(input.age),
          gender: normaliseBucket(input.gender),
        };
        const existing = await this.findOne(key);
        if (existing) {
          existing.set(input);
          return existing.save();
        }
        return this.create(input);
      },
    },
  },
);

// one row per day × ad × campaign × ad set × age × gender, so re-importing a sheet is idempotent
facebookAdReportSchema.index(
  { report_date: 1, ad_name: 1, campaign_name: 1, ad_set_name: 1, age: 1, gender: 1 },
  { unique: true, name: 'report_row_unique' },
);
facebookAdReportSchema.index({ age: 1 });
facebookAdReportSchema.index({ gender: 1 });
facebookAdReportSchema.index({ ad_name: 1, report_date: 1 });
facebookAdReportSchema.index({ offer_name: 1 });
facebookAdReportSchema.index({ provider_name: 1 });

// normalise, then (re)compute every derived field from the base numbers
facebookAdReportSchema.pre('validate', function fillDerived(this: FacebookAdReportDocument) {
  if (this.provider_name !== null && this.provider_name !== undefined && this.provider_name.trim() === '') {
    this.provider_name = null;
  }
  if (!this.provider_name) this.provider_fee_pct = 0;
  // a row loaded with a ×100 percentage (753) is corrected before it is validated and recomputed
  this.provider_fee_pct = normaliseFeePct(this.provider_fee_pct);
  this.set(deriveFields(this));
});

export const FacebookAdReport = model<IFacebookAdReport, FacebookAdReportModel>(
  'FacebookAdReport',
  facebookAdReportSchema,
);

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function toPublicFacebookAdReport(doc: FacebookAdReportDocument): PublicFacebookAdReport {
  return {
    id: doc.id,
    report_date: isoDay(doc.report_date),
    ad_name: doc.ad_name,
    offer_name: doc.offer_name,
    campaign_name: doc.campaign_name,
    ad_set_name: doc.ad_set_name,
    provider_name: doc.provider_name,
    age: doc.age,
    gender: doc.gender,
    image_url: doc.image_url,
    video_url: doc.video_url,
    spend_usd: doc.spend_usd,
    provider_fee_pct: doc.provider_fee_pct,
    provider_fee_usd: doc.provider_fee_usd,
    total_spend_usd: doc.total_spend_usd,
    impressions: doc.impressions,
    clicks_all: doc.clicks_all,
    link_clicks: doc.link_clicks,
    landing_page_views: doc.landing_page_views,
    ctr_all: doc.ctr_all,
    cpc_usd: doc.cpc_usd,
    presell_visits: doc.presell_visits,
    first_page_views: doc.first_page_views,
    questionnaire_starts: doc.questionnaire_starts,
    questionnaire_completed: doc.questionnaire_completed,
    add_to_carts: doc.add_to_carts,
    purchase_events: doc.purchase_events,
    conversions: doc.conversions,
    revenue_usd: doc.revenue_usd,
    gross_profit_usd: doc.gross_profit_usd,
    net_profit_usd: doc.net_profit_usd,
    roas_pct: doc.roas_pct,
    cac_usd: doc.cac_usd,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
