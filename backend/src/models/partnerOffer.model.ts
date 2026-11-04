import { Schema, model, type Model } from 'mongoose';

/**
 * Which partner (affiliate network) and which partner login each offer runs under, per
 * platform. Set on the Ad groups page; the Finance page groups offers by partner → login.
 * Only the login's username is kept — never a password.
 */
export const PARTNER_PLATFORMS = ['facebook', 'bing'] as const;
export type PartnerPlatform = (typeof PARTNER_PLATFORMS)[number];

export interface IPartnerOffer {
  platform: PartnerPlatform;
  offer_name: string;
  partner_name: string;
  partner_login: string | null;
}

const partnerOfferSchema = new Schema<IPartnerOffer>(
  {
    platform: { type: String, required: true, enum: PARTNER_PLATFORMS },
    offer_name: { type: String, required: true, trim: true, maxlength: 300 },
    partner_name: { type: String, required: true, trim: true, maxlength: 120 },
    partner_login: { type: String, trim: true, maxlength: 120, default: null },
  },
  { collection: 'partner_offers', timestamps: true },
);

partnerOfferSchema.index({ platform: 1, offer_name: 1 }, { unique: true });

export const PartnerOffer: Model<IPartnerOffer> = model<IPartnerOffer>('PartnerOffer', partnerOfferSchema);
