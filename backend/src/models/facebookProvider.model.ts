import { Schema, model, type Model } from 'mongoose';

/**
 * Ad platform provider fee table (one document per provider). The fee for every
 * facebook_ad_reports row is taken from here by its provider_name; rows without a
 * provider use the provider marked `is_default: true`. Change a fee or the default
 * here and every dashboard number follows — no re-import needed.
 */
export interface IFacebookProvider {
  provider_name: string;
  fee_pct: number; // 6.38 for 6.38 %
  is_default: boolean;
}

const facebookProviderSchema = new Schema<IFacebookProvider>(
  {
    provider_name: { type: String, required: true, trim: true, maxlength: 200 },
    fee_pct: { type: Number, required: true, min: 0, max: 100 },
    is_default: { type: Boolean, required: true, default: false },
  },
  { collection: 'facebook_providers', timestamps: true },
);

facebookProviderSchema.index({ provider_name: 1 }, { unique: true });

export const FacebookProvider: Model<IFacebookProvider> = model<IFacebookProvider>(
  'FacebookProvider',
  facebookProviderSchema,
);
