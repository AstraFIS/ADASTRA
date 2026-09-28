import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * One audience breakdown row: an ad on one day, split by one demographic
 * bucket (age band or gender), the way Facebook exports breakdowns. Kept in
 * its own collection because breakdown rows do not line up with the funnel /
 * revenue rows in facebook_ad_reports.
 */
export const AUDIENCE_BREAKDOWNS = ['age', 'gender'] as const;
export type AudienceBreakdown = (typeof AUDIENCE_BREAKDOWNS)[number];

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

export interface IFacebookAudienceReport {
  report_date: Date;
  ad_name: string;
  breakdown: AudienceBreakdown;
  bucket: string; // e.g. "25-34", "65+", "male", "unknown"
  impressions: number;
  clicks_all: number;
  link_clicks: number;
  spend_usd: number;
  createdAt: Date;
  updatedAt: Date;
}

export type FacebookAudienceReportInput = Omit<IFacebookAudienceReport, 'createdAt' | 'updatedAt'>;
export type FacebookAudienceReportDocument = HydratedDocument<IFacebookAudienceReport>;

export interface FacebookAudienceReportModel extends Model<IFacebookAudienceReport> {
  /** Insert or update the row identified by (report_date, ad_name, breakdown, bucket). */
  upsertRow(input: FacebookAudienceReportInput): Promise<FacebookAudienceReportDocument>;
}

/** "Male" → "male", " 18 – 24 " → "18-24", "" → "unknown" */
export function normaliseBucket(raw: string): string {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
  return v === '' ? 'unknown' : v;
}

const count = { type: Number, required: true, min: 0, default: 0 };

const schema = new Schema<IFacebookAudienceReport, FacebookAudienceReportModel>(
  {
    report_date: { type: Date, required: true },
    ad_name: { type: String, required: true, trim: true, maxlength: 200 },
    breakdown: { type: String, required: true, enum: AUDIENCE_BREAKDOWNS },
    bucket: { type: String, required: true, trim: true, maxlength: 40, set: normaliseBucket },
    impressions: count,
    clicks_all: count,
    link_clicks: count,
    spend_usd: { type: Number, required: true, min: 0, default: 0 },
  },
  {
    collection: 'facebook_audience_reports',
    timestamps: true,
    statics: {
      async upsertRow(input: FacebookAudienceReportInput) {
        const key = {
          report_date: input.report_date,
          ad_name: input.ad_name.trim(),
          breakdown: input.breakdown,
          bucket: normaliseBucket(input.bucket),
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

schema.index({ report_date: 1, ad_name: 1, breakdown: 1, bucket: 1 }, { unique: true });
schema.index({ ad_name: 1, report_date: 1 });

export const FacebookAudienceReport = model<IFacebookAudienceReport, FacebookAudienceReportModel>(
  'FacebookAudienceReport',
  schema,
);
